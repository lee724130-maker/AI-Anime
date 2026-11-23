import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FileUrlService } from './file-url.service';

/**
 * 文件归属反查（2026-11-23 越权修复 D 方案配套）。
 *
 * 用途：给「**入参是文件路径**」的接口做归属校验（如 `POST /api/editor/concat` 的 urlA/urlB）。
 * 这类接口不能只靠签名 URL —— 攻击者可以自己拼一个合法签名吗？不能（没有密钥），
 * 但历史上它们接受任意 `/static/...`，等于把别人的文件当自己的用，所以再加一道属主校验。
 *
 * 归属来源不是单表：`media_files` 只有 39 行、磁盘有 59 个文件，它**不是完整登记表**，
 * 因此这里按「哪些表会存该路径」逐表反查（实测 41/59 可唯一确定属主、0 冲突；
 * 剩下的是作品展/活动宣传图等公开内容与无引用的历史孤儿文件）。
 */
type Source = { table: string; userCol: string; cols: string[] };

const SOURCES: Source[] = [
  { table: 'media_files', userCol: 'user_id', cols: ['url', 'thumbnail_url'] },
  { table: 'generation_tasks', userCol: 'user_id', cols: ['output_data', 'cover_url'] },
  { table: 'global_assets', userCol: 'user_id', cols: ['image_url', 'video_url', 'audio_url'] },
  { table: 'drama_projects', userCol: 'user_id', cols: ['cover_url', 'outline', 'analysis'] },
  { table: 'drama_assets', userCol: 'project_id', cols: ['image_url', 'prompt'] },
  { table: 'drama_segments', userCol: 'episode_id', cols: ['video_url', 'audio_url'] },
  { table: 'drama_episodes', userCol: 'project_id', cols: ['video_url'] },
  { table: 'viral_projects', userCol: 'user_id', cols: ['result_url', 'cover_url', 'scenes'] },
  { table: 'viral_templates', userCol: 'user_id', cols: ['thumbnail', 'cover_url', 'source_url', 'scenes'] },
  { table: 'canvas_projects', userCol: 'user_id', cols: ['result_url', 'cover_url', 'nodes'] },
  { table: 'canvas_templates', userCol: 'user_id', cols: ['nodes', 'cover_url'] },
  { table: 'editor_projects', userCol: 'user_id', cols: ['result_url', 'nodes'] },
  { table: 'comic_projects', userCol: 'user_id', cols: ['export_url', 'panel_spec', 'character_list'] },
  { table: 'video_tasks', userCol: 'user_id', cols: ['video_url', 'result_url'] },
  { table: 'users', userCol: 'id', cols: ['avatar'] },
];

/** 子表 → 项目表的间接归属（drama_assets/drama_segments/drama_episodes 没有直接 user_id） */
const PARENTS: Record<string, { table: string; from: string; to: string }> = {
  drama_assets: { table: 'drama_projects', from: 'project_id', to: 'id' },
  drama_segments: { table: 'drama_episodes', from: 'episode_id', to: 'id' },
  drama_episodes: { table: 'drama_projects', from: 'project_id', to: 'id' },
};

@Injectable()
export class FileOwnershipService {
  private readonly logger = new Logger(FileOwnershipService.name);
  /** 进程内缓存：文件名 → 属主（含 null=查不到）。文件不可变，缓存安全，TTL 兜住新建文件的场景 */
  private cache = new Map<string, { owners: number[]; at: number }>();
  private static TTL_MS = 5 * 60 * 1000;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly fileUrl: FileUrlService,
  ) {}

  /** 返回引用了该文件的所有 user_id（去重）；空数组 = 数据库里查不到归属 */
  async ownersOf(urlOrName: string): Promise<number[]> {
    const name = this.basenameOf(urlOrName);
    if (!name) return [];
    const hit = this.cache.get(name);
    if (hit && Date.now() - hit.at < FileOwnershipService.TTL_MS) return hit.owners;

    const owners = new Set<number>();
    for (const src of SOURCES) {
      try {
        if (!(await this.tableExists(src.table))) continue;
        const ors = src.cols.map((c) => `\`${c}\` LIKE ?`).join(' OR ');
        const rows: any[] = await this.ds.query(
          `SELECT \`${src.userCol}\` AS u FROM \`${src.table}\` WHERE (${ors}) AND \`${src.userCol}\` IS NOT NULL LIMIT 5`,
          src.cols.map(() => `%${name}%`),
        );
        for (const r of rows) if (r.u != null) owners.add(Number(r.u));
      } catch (e: any) {
        this.logger.debug(`ownersOf ${src.table} skip: ${e?.message}`);
      }
    }

    // 子表没直接 user_id 的，顺父表再查一次
    for (const src of SOURCES) {
      const parent = PARENTS[src.table];
      if (!parent) continue;
      try {
        if (!(await this.tableExists(src.table)) || !(await this.tableExists(parent.table))) continue;
        const ors = src.cols.map((c) => `\`${src.table}\`.\`${c}\` LIKE ?`).join(' OR ');
        const rows: any[] = await this.ds.query(
          `SELECT p.\`user_id\` AS u FROM \`${src.table}\` s JOIN \`${parent.table}\` p ON p.\`${parent.to}\` = s.\`${parent.from}\` WHERE (${ors}) AND p.\`user_id\` IS NOT NULL LIMIT 5`,
          src.cols.map(() => `%${name}%`),
        );
        for (const r of rows) if (r.u != null) owners.add(Number(r.u));
      } catch (e: any) {
        this.logger.debug(`ownersOf parent ${src.table} skip: ${e?.message}`);
      }
    }

    const list = [...owners];
    this.cache.set(name, { owners: list, at: Date.now() });
    return list;
  }

  async owns(userId: number, urlOrName: string): Promise<boolean> {
    const owners = await this.ownersOf(urlOrName);
    return owners.includes(Number(userId));
  }

  existsInDb(urlOrName: string): Promise<boolean> {
    return this.ownersOf(urlOrName).then((o) => o.length > 0);
  }

  /** 供 video/file 这类只给文件名的接口复用：从 information_schema 判断表是否存在（结果缓存） */
  private tableCache = new Map<string, boolean>();
  private async tableExists(t: string): Promise<boolean> {
    const cached = this.tableCache.get(t);
    if (cached !== undefined) return cached;
    const rows: any[] = await this.ds.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
      [t],
    );
    const ok = rows.length > 0;
    this.tableCache.set(t, ok);
    return ok;
  }

  private basenameOf(urlOrName: string): string {
    if (typeof urlOrName !== 'string') return '';
    let s = urlOrName.trim();
    try { s = decodeURIComponent(s); } catch { /* ignore */ }
    s = s.split('?')[0];
    s = this.fileUrl.strip(s);
    const base = s.split('/').pop() || '';
    if (!base || base.includes('..')) return '';
    return base;
  }
}
