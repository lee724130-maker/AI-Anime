import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

const TEMP_DIR_PREFIXES = ['viral_frames_', 'viral_analyze_', 'viral_gen_', 'viral_reg_', 'canvas_gen_', 'editor_gen_'];
const STALE_FILE_EXT = /\.(mp4|webm|mov|mkv|jpg|jpeg|png|webp|gif|mp3|m4a|wav)$/i;
const TEMP_DIR_AGE = 2 * 60 * 60 * 1000;      // temp dirs older than 2h (crash leftovers)
const RESULT_FILE_AGE = 30 * 24 * 60 * 60 * 1000; // unreferenced result files older than 30 days

/**
 * Periodic output/ hygiene:
 * - deletes crashed leftover temp dirs (viral_frames_ / viral_analyze_ / canvas_gen_ etc.) older than 2h
 * - deletes unreferenced viral_source_*.mp4 older than 2h
 * - deletes stale unreferenced result files (canvas_result_/viral_result_/scene/upload/...) older than 30 days
 * - files referenced by ANY table (projects/templates/media/drama assets) are NEVER deleted
 */
@Injectable()
export class CleanupService implements OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private readonly outputDir: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    this.outputDir = path.resolve(process.cwd(), 'output');
    this.run().catch(() => {});
    this.timer = setInterval(() => this.run().catch(() => {}), 6 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    try {
      if (!fs.existsSync(this.outputDir)) return;
      // Referenced names MUST be collected successfully before deleting
      // anything; a failed collection would empty the whitelist and could
      // delete files still referenced by DB rows (e.g. template frames/sources)
      let referenced: { files: Set<string>; dirs: Set<string> };
      try {
        referenced = await this.collectReferenced();
      } catch (err: any) {
        this.logger.warn(`引用收集失败，本轮清理中止（保护被引用文件）: ${err.message}`);
        return;
      }
      const now = Date.now();
      let removed = 0;
      const entries = fs.readdirSync(this.outputDir, { withFileTypes: true });
      for (const e of entries) {
        const fullPath = path.join(this.outputDir, e.name);
        // 引用集合统一转小写存储，比较时同样转小写（Linux 文件系统大小写敏感）
        const lowerName = e.name.toLowerCase();
        if (e.isDirectory()) {
          if (!TEMP_DIR_PREFIXES.some((p) => e.name.startsWith(p))) continue;
          if (referenced.dirs.has(lowerName)) continue; // referenced → never delete
          try {
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs >= TEMP_DIR_AGE) {
              fs.rmSync(fullPath, { recursive: true, force: true });
              removed++;
              this.logger.log(`清理孤儿临时目录: ${e.name}`);
            }
          } catch { /* ignore */ }
          continue;
        }
        if (!e.isFile() || !STALE_FILE_EXT.test(e.name)) continue;
        if (referenced.files.has(lowerName)) continue; // referenced → never delete
        try {
          const stat = fs.statSync(fullPath);
          const isSource = e.name.startsWith('viral_source_');
          const age = now - stat.mtimeMs;
          if (isSource ? age >= TEMP_DIR_AGE : age >= RESULT_FILE_AGE) {
            fs.rmSync(fullPath, { force: true });
            removed++;
            this.logger.log(`清理${isSource ? '无引用源视频' : '无引用历史成片'}: ${e.name}`);
          }
        } catch { /* ignore */ }
      }
      if (removed > 0) this.logger.log(`output/ 清理完成，共移除 ${removed} 项`);
    } catch (err: any) {
      this.logger.warn(`output/ 清理失败: ${err.message}`);
    }
  }

  /**
   * Collect every /static/xxx basename (files) and viral_frames_xxx dir name
   * referenced by any table. Throws on SQL failure so callers abort cleanup.
   */
  private async collectReferenced(): Promise<{ files: Set<string>; dirs: Set<string> }> {
    const files = new Set<string>();
    const dirs = new Set<string>();
    const rows: Array<{ v: string | null }> = await this.dataSource.query(`
      SELECT url AS v FROM media_files WHERE url LIKE '%/static/%'
      UNION SELECT result_url FROM canvas_projects WHERE result_url LIKE '%/static/%'
      UNION SELECT nodes FROM canvas_projects WHERE nodes LIKE '%/static/%'
      UNION SELECT nodes FROM canvas_templates WHERE nodes LIKE '%/static/%'
      UNION SELECT result_url FROM viral_projects WHERE result_url LIKE '%/static/%'
      UNION SELECT scenes FROM viral_projects WHERE scenes LIKE '%/static/%'
      UNION SELECT media_refs FROM viral_projects WHERE media_refs LIKE '%/static/%'
      UNION SELECT reference_url FROM viral_templates WHERE reference_url LIKE '%/static/%'
      UNION SELECT reference_frames FROM viral_templates WHERE reference_frames LIKE '%/static/%'
      UNION SELECT video_url FROM drama_episodes WHERE video_url LIKE '%/static/%'
      UNION SELECT video_url FROM drama_segments WHERE video_url LIKE '%/static/%'
      UNION SELECT video_url FROM drama_segment_candidates WHERE video_url LIKE '%/static/%'
      UNION SELECT image_url FROM drama_assets WHERE image_url LIKE '%/static/%'
      UNION SELECT image_url FROM global_assets WHERE image_url LIKE '%/static/%'
      UNION SELECT video_url FROM global_assets WHERE video_url LIKE '%/static/%'
      UNION SELECT audio_url FROM global_assets WHERE audio_url LIKE '%/static/%'
      UNION SELECT result_url FROM editor_projects WHERE result_url LIKE '%/static/%'
      UNION SELECT timeline FROM editor_projects WHERE timeline LIKE '%/static/%'
      UNION SELECT video_url FROM video_tasks WHERE video_url LIKE '%/static/%'
      UNION SELECT cover_url FROM video_tasks WHERE cover_url LIKE '%/static/%'
      UNION SELECT reference_image FROM video_tasks WHERE reference_image LIKE '%/static/%'
      UNION SELECT job_data FROM video_tasks WHERE job_data LIKE '%/static/%'
      UNION SELECT output_data FROM generation_tasks WHERE output_data LIKE '%/static/%'
      UNION SELECT input_data FROM generation_tasks WHERE input_data LIKE '%/static/%'
      UNION SELECT avatar_url FROM characters WHERE avatar_url LIKE '%/static/%'
      UNION SELECT reference_image_anime FROM characters WHERE reference_image_anime LIKE '%/static/%'
      UNION SELECT reference_image_realistic FROM characters WHERE reference_image_realistic LIKE '%/static/%'
    `);
    for (const r of rows) {
      if (!r || !r.v) continue;
      // viral_frames_xxx/name.jpg → dir name + file name
      const dirMs = String(r.v).match(/\/(static\/)?(viral_frames_[^/\\"'\s\])]+)\//gi);
      if (dirMs) for (const m of dirMs) {
        const dir = m.replace(/^.*\/(static\/)?/, '').replace(/\/$/, '').toLowerCase();
        if (dir) dirs.add(dir);
      }
      const fileMs = String(r.v).match(/\/(?:static\/)?([^/\\"'\s\])]+\.(?:mp4|webm|mov|mkv|jpg|jpeg|png|webp|gif|mp3|m4a|wav))/gi);
      if (fileMs) for (const m of fileMs) {
        const base = m.replace(/^.*\/(static\/)?/, '').toLowerCase();
        if (base) files.add(base);
      }
    }
    return { files, dirs };
  }
}
