import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ShowcaseWork } from '../workbench/showcase-work.entity';
import { FFmpegUtil } from '../../utils/ffmpeg.util';

/** 与 workbench.getShowcase 相同的内置分类兜底（字典读 system_configs.showcase_categories） */
const BUILTIN_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'event', label: '活动制作' },
  { key: 'short_video', label: '视频短片' },
  { key: 'series', label: '长篇漫剧' },
  { key: 'ad', label: '广告' },
];

const STATUSES = ['pending', 'online', 'offline'];
const SOURCE_TYPES = ['drama', 'generate', 'viral', 'editor', 'upload'];
/** update 白名单：只有这些列可被 admin 改（防任意列写入） */
const UPDATABLE = [
  'title', 'category', 'video_url', 'cover_url', 'duration', 'author_name',
  'source_type', 'source_id', 'likes', 'views', 'status', 'sort',
] as const;

/**
 * 作品展后台管理（dev-checklist Part 3 后续：管理员在 admin 后台更换/删除/新增展示作品）。
 * 对外展示仍只走 workbench.getShowcase（status=online）；本服务管全量记录。
 * 删除只删记录不删文件（视频/封面可能被其他表引用，孤儿文件交给 cleanup 30 天策略）。
 */
@Injectable()
export class ShowcaseAdminService {
  private readonly logger = new Logger(ShowcaseAdminService.name);

  constructor(
    @InjectRepository(ShowcaseWork) private readonly repo: Repository<ShowcaseWork>,
    private readonly ffmpeg: FFmpegUtil,
  ) {}

  async list() {
    const items = await this.repo.find({ order: { created_at: 'DESC', id: 'DESC' } });
    return { categories: await this.categories(), items };
  }

  private async categories(): Promise<Array<{ key: string; label: string }>> {
    try {
      const row = await this.repo.manager.query(
        `SELECT config_value FROM system_configs WHERE config_key = 'showcase_categories'`,
      );
      const raw = row?.[0]?.config_value;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* 字典坏了用内置默认 */ }
    return BUILTIN_CATEGORIES;
  }

  // ── 校验辅助 ──
  private str(v: unknown, field: string, max: number, required = false): string | null {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) {
      if (required) throw new BadRequestException(`${field} 不能为空`);
      return null;
    }
    if (s.length > max) throw new BadRequestException(`${field} 长度不能超过 ${max}`);
    return s;
  }

  private url(v: unknown, field: string, required = false): string | null {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) {
      if (required) throw new BadRequestException(`${field} 不能为空`);
      return null;
    }
    if (!/^(\/static\/|https?:\/\/)/.test(s)) {
      throw new BadRequestException(`${field} 仅支持 /static/ 站内地址或 http(s) 外链`);
    }
    if (s.length > 500) throw new BadRequestException(`${field} 长度不能超过 500`);
    return s;
  }

  private int(v: unknown, field: string, min: number, max: number, fallback: number): number {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new BadRequestException(`${field} 必须是数字`);
    if (n < min || n > max) throw new BadRequestException(`${field} 范围 ${min}~${max}`);
    return Math.round(n);
  }

  private status(v: unknown, fallback: string): string {
    const s = typeof v === 'string' ? v : fallback;
    if (!STATUSES.includes(s)) throw new BadRequestException(`status 仅支持 ${STATUSES.join('/')}`);
    return s;
  }

  // ── 本地文件辅助（/static/ ↔ backend/output/） ──
  private localPath(url: string | null): string | null {
    if (!url || !url.startsWith('/static/')) return null;
    const outDir = path.resolve(process.cwd(), 'output');
    const abs = path.resolve(outDir, url.slice('/static/'.length));
    if (!abs.startsWith(outDir + path.sep)) return null; // 路径穿越防护
    return fs.existsSync(abs) ? abs : null;
  }

  /** 本地视频抽帧做封面；外链/失败返回 null（保留旧封面，不影响主流程） */
  private async autoCover(videoUrl: string | null): Promise<string | null> {
    const p = this.localPath(videoUrl);
    if (!p) return null;
    try {
      const out = await this.ffmpeg.extractFrame(p, 1);
      return `/static/${path.basename(out)}`;
    } catch (e: any) {
      this.logger.warn(`auto cover failed for ${videoUrl}: ${e.message}`);
      return null;
    }
  }

  /** 本地视频读时长（秒，取整）；读不到返回 null */
  private async probeDuration(videoUrl: string | null): Promise<number | null> {
    const p = this.localPath(videoUrl);
    if (!p) return null;
    try {
      const info = await this.ffmpeg.getVideoInfo(p);
      return info.duration > 0 ? Math.round(info.duration) : null;
    } catch {
      return null;
    }
  }

  // ── CRUD ──
  async create(body: any) {
    const title = this.str(body?.title, 'title', 120, true)!;
    const category = this.str(body?.category, 'category', 40, true)!;
    const video_url = this.url(body?.video_url, 'video_url', true)!;

    const w = new ShowcaseWork();
    w.title = title;
    w.category = category;
    w.video_url = video_url;
    w.cover_url = this.url(body?.cover_url, 'cover_url');
    w.author_name = this.str(body?.author_name, 'author_name', 50);
    w.source_type = this.str(body?.source_type, 'source_type', 20) || 'upload';
    if (!SOURCE_TYPES.includes(w.source_type)) w.source_type = 'upload';
    w.source_id = body?.source_id === undefined || body?.source_id === null || body?.source_id === ''
      ? null : this.int(body.source_id, 'source_id', 1, 2147483647, 1);
    w.likes = this.int(body?.likes, 'likes', 0, 100000000, 0);
    w.views = this.int(body?.views, 'views', 0, 100000000, 0);
    w.status = this.status(body?.status, 'online');
    w.sort = this.int(body?.sort, 'sort', -100000, 100000, 0);

    // 时长留空 → 自动 ffprobe 本地视频
    const dur = body?.duration;
    w.duration = (dur === undefined || dur === null || dur === '')
      ? await this.probeDuration(video_url)
      : this.int(dur, 'duration', 0, 86400, 0);
    // 封面留空 → 自动抽帧（仅本地视频）
    if (!w.cover_url) w.cover_url = await this.autoCover(video_url);

    return this.repo.save(w);
  }

  async update(id: number, body: any) {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('作品不存在');

    const patch: Partial<ShowcaseWork> = {};
    for (const key of UPDATABLE) {
      if (body?.[key] === undefined) continue;
      switch (key) {
        case 'title': patch.title = this.str(body.title, 'title', 120, true)!; break;
        case 'category': patch.category = this.str(body.category, 'category', 40, true)!; break;
        case 'video_url': patch.video_url = this.url(body.video_url, 'video_url', true)!; break;
        case 'cover_url': patch.cover_url = this.url(body.cover_url, 'cover_url'); break;
        case 'author_name': patch.author_name = this.str(body.author_name, 'author_name', 50); break;
        case 'status': patch.status = this.status(body.status, w.status); break;
        case 'source_type':
          patch.source_type = this.str(body.source_type, 'source_type', 20) || w.source_type;
          if (!SOURCE_TYPES.includes(patch.source_type)) patch.source_type = w.source_type;
          break;
        case 'source_id':
          patch.source_id = body.source_id === null || body.source_id === ''
            ? null : this.int(body.source_id, 'source_id', 1, 2147483647, 1);
          break;
        case 'duration':
          patch.duration = body.duration === null || body.duration === ''
            ? null : this.int(body.duration, 'duration', 0, 86400, 0);
          break;
        case 'likes': patch.likes = this.int(body.likes, 'likes', 0, 100000000, 0); break;
        case 'views': patch.views = this.int(body.views, 'views', 0, 100000000, 0); break;
        case 'sort': patch.sort = this.int(body.sort, 'sort', -100000, 100000, 0); break;
      }
    }

    // 更换视频且未显式指定新封面 → 自动抽帧换封面；时长未显式给 → 重读
    const newVideo = typeof patch.video_url === 'string' ? patch.video_url : null;
    const videoChanged = newVideo !== null && newVideo !== w.video_url;
    if (videoChanged && newVideo) {
      if (body?.cover_url === undefined) {
        const cover = await this.autoCover(newVideo);
        if (cover) patch.cover_url = cover;
      }
      if (body?.duration === undefined) {
        const dur = await this.probeDuration(newVideo);
        if (dur !== null) patch.duration = dur;
      }
    }

    Object.assign(w, patch);
    return this.repo.save(w);
  }

  async delete(id: number) {
    const w = await this.repo.findOne({ where: { id } });
    if (!w) throw new NotFoundException('作品不存在');
    // 只删记录：视频/封面可能被其他记录或表引用，物理文件交给 cleanup 30 天孤儿策略
    await this.repo.remove(w);
    return { deleted: true, id };
  }

  /** 手动抽帧出封面（FE「从视频抽帧」按钮）；仅站内 /static/ 视频 */
  async coverFromVideo(videoUrl: unknown) {
    const url = this.url(videoUrl, 'video_url', true)!;
    const cover = await this.autoCover(url);
    if (!cover) throw new BadRequestException('抽帧失败：仅支持站内 /static/ 视频，且文件需存在');
    return { cover_url: cover };
  }
}
