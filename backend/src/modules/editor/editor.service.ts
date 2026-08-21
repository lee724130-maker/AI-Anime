import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EditorProject } from './editor-project.entity';
import { CanvasService, resFromResolution } from '../canvas/canvas.service';
import { FFmpegUtil, runFfmpegQueued } from '../../utils/ffmpeg.util';
import { assertDiskSpace } from '../../common/utils/disk-check.util';
import * as fs from 'fs';
import * as path from 'path';

const MIN_DISK_FREE_BYTES = 1024 * 1024 * 1024;
export const EDITOR_MAX_TOTAL_SECONDS = 60;
export const EDITOR_MAX_ITEMS = 20;

const TRANSITION_TYPES = [
  'fade', 'fade_black', 'fade_white', 'dissolve',
  'wipe_left', 'wipe_right', 'slide_left', 'slide_right', 'circle',
];

const FILTER_TYPES = [
  'grayscale', 'sepia', 'warm', 'cool', 'vintage', 'bright', 'dark', 'contrast', 'soft', 'vivid',
];

const ANIMATION_TYPES = ['none', 'fade', 'slide_up', 'zoom_in'];

function normalizeTimeline(tl: any): any {
  const video = Array.isArray(tl?.video) ? tl.video : [];
  const audio = Array.isArray(tl?.audio) ? tl.audio : [];
  const text = Array.isArray(tl?.text) ? tl.text : [];
  return { duration: Number(tl?.duration) || 0, video, audio, text };
}

function numOr(v: any, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

@Injectable()
export class EditorService {
  private readonly logger = new Logger(EditorService.name);
  private readonly outputDir: string;

  constructor(
    @InjectRepository(EditorProject)
    private readonly projectRepo: Repository<EditorProject>,
    private readonly ffmpeg: FFmpegUtil,
    private readonly canvasService: CanvasService,
  ) {
    this.outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  // ═══════════ CRUD ═══════════

  async listProjects(userId: number) {
    const items = await this.projectRepo.find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });
    return items.map((p) => ({
      ...p,
      timeline: this.parseTimeline(p.timeline),
      cover_url: p.result_url || this.firstVideoUrl(this.parseTimeline(p.timeline)),
    }));
  }

  async getProjectById(id: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('剪辑项目不存在');
    return { ...p, timeline: this.parseTimeline(p.timeline) };
  }

  async createProject(userId: number, dto: any) {
    const timeline = dto.timeline ? this.parseTimeline(dto.timeline) : normalizeTimeline(null);
    this.validateTimeline(timeline, true);
    const project = this.projectRepo.create({
      user_id: userId,
      name: dto.name || '未命名剪辑',
      ratio: dto.ratio || '9:16',
      resolution: dto.resolution || '720p',
      timeline: JSON.stringify(timeline),
      status: 'pending',
      progress: 0,
    });
    await this.projectRepo.save(project);
    return this.getProjectById(project.id, userId);
  }

  async updateProject(id: number, userId: number, dto: any) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('剪辑项目不存在');
    if (dto.name !== undefined) p.name = dto.name;
    if (dto.ratio !== undefined) p.ratio = dto.ratio;
    if (dto.resolution !== undefined) p.resolution = dto.resolution;
    if (dto.timeline !== undefined) {
      const timeline = this.parseTimeline(dto.timeline);
      this.validateTimeline(timeline, true);
      p.timeline = JSON.stringify(timeline);
    }
    await this.projectRepo.save(p);
    return this.getProjectById(id, userId);
  }

  async deleteProject(id: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('剪辑项目不存在');
    if (p.result_url) {
      const m = p.result_url.match(/\/static\/([^/]+)$/);
      if (m) {
        try { fs.rmSync(path.join(this.outputDir, m[1]), { force: true }); } catch { /* ignore */ }
      }
    }
    try {
      const entries = fs.readdirSync(this.outputDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && e.name.startsWith(`editor_gen_${id}_`)) {
          fs.rmSync(path.join(this.outputDir, e.name), { recursive: true, force: true });
        }
      }
    } catch { /* ignore */ }
    await this.projectRepo.remove(p);
    return { success: true };
  }

  async getProjectResult(id: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('剪辑项目不存在');
    return {
      id: p.id,
      status: p.status,
      progress: p.progress,
      result_url: p.result_url,
      error_msg: p.error_msg,
    };
  }

  // ═══════════ Validation ═══════════

  private validateTimeline(tl: any, allowEmpty = false) {
    const { video, audio, text } = tl;
    const totalItems = video.length + audio.length + text.length;
    if (totalItems === 0) {
      if (allowEmpty) return;
      throw new BadRequestException('时间线为空，请先添加素材');
    }
    if (totalItems > EDITOR_MAX_ITEMS) {
      throw new BadRequestException(`素材数量不能超过 ${EDITOR_MAX_ITEMS} 个（当前 ${totalItems} 个）`);
    }
    const checkUrl = (url: string, label: string) => {
      if (typeof url !== 'string' || !url) throw new BadRequestException(`${label}：素材地址无效`);
      if (!(/^\/static\//.test(url) || /^https?:\/\//i.test(url))) {
        throw new BadRequestException(`${label}：不支持的素材地址`);
      }
    };
    let maxEnd = 0;
    const ends: number[] = [];
    for (const v of video) {
      const start = Math.max(0, Number(v.start) || 0);
      const dur = Number(v.duration) || 0;
      if (dur < 1 || dur > EDITOR_MAX_TOTAL_SECONDS) {
        throw new BadRequestException(`视频片段时长需在 1~${EDITOR_MAX_TOTAL_SECONDS} 秒之间`);
      }
      checkUrl(v.url, '视频片段');
      if (v.filter && v.filter !== 'none' && !FILTER_TYPES.includes(v.filter)) {
        throw new BadRequestException(`不支持的滤镜：${v.filter}`);
      }
      if (v.nextTransition && v.nextTransition.type && v.nextTransition.type !== 'none') {
        if (!TRANSITION_TYPES.includes(v.nextTransition.type)) {
          throw new BadRequestException(`不支持的转场：${v.nextTransition.type}`);
        }
        const td = Number(v.nextTransition.duration) || 0.5;
        if (td < 0.2 || td > 1.5) throw new BadRequestException('转场时长需在 0.2~1.5 秒之间');
      }
      ends.push(start + dur);
    }
    for (const a of audio) {
      const start = Math.max(0, Number(a.start) || 0);
      const dur = Number(a.duration) || 0;
      if (dur < 0.5 || dur > EDITOR_MAX_TOTAL_SECONDS + 10) {
        throw new BadRequestException(`音频片段时长需在 0.5~${EDITOR_MAX_TOTAL_SECONDS + 10} 秒之间`);
      }
      checkUrl(a.url, '音频片段');
      ends.push(start + dur);
    }
    for (const t of text) {
      const start = Math.max(0, Number(t.start) || 0);
      const dur = Number(t.duration) || 0;
      if (dur < 0.5 || dur > EDITOR_MAX_TOTAL_SECONDS) {
        throw new BadRequestException(`文字片段时长需在 0.5~${EDITOR_MAX_TOTAL_SECONDS} 秒之间`);
      }
      if (!t.text || !String(t.text).trim()) throw new BadRequestException('文字内容不能为空');
      if (t.animation && !ANIMATION_TYPES.includes(t.animation)) {
        throw new BadRequestException(`不支持的动画：${t.animation}`);
      }
      ends.push(start + dur);
    }
    maxEnd = Math.max(0, ...ends);
    if (maxEnd > EDITOR_MAX_TOTAL_SECONDS) {
      throw new BadRequestException(`视频总长度不能超过 ${EDITOR_MAX_TOTAL_SECONDS} 秒（当前 ${maxEnd.toFixed(1)} 秒）`);
    }
  }

  // ═══════════ Render ═══════════

  async startRender(projectId: number, userId: number) {
    assertDiskSpace(this.outputDir, MIN_DISK_FREE_BYTES);
    const upd = await this.projectRepo.createQueryBuilder()
      .update(EditorProject)
      .set({ status: 'rendering', progress: 0, error_msg: '' })
      .where('id = :id AND user_id = :uid AND status <> :st', { id: projectId, uid: userId, st: 'rendering' })
      .execute();
    if (!upd.affected) {
      const p = await this.projectRepo.findOne({ where: { id: projectId, user_id: userId } });
      if (!p) throw new NotFoundException('剪辑项目不存在');
      throw new BadRequestException('项目正在渲染中，请稍候');
    }
    this.doRender(projectId).catch((err) => {
      this.logger.error(`Editor render #${projectId} failed: ${err.message}`);
    });
    return { status: 'rendering', progress: 0 };
  }

  private async doRender(projectId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) return;

    const update = async (patch: Partial<EditorProject>) => {
      const row = await this.projectRepo.findOne({ where: { id: projectId } });
      if (!row) return;
      Object.assign(row, patch);
      await this.projectRepo.save(row);
    };

    let trimFiles: string[] = [];
    try {
      const tl = this.parseTimeline(project.timeline);
      this.validateTimeline(tl);
      const videos = [...tl.video].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
      if (videos.length === 0 && tl.text.length === 0) {
        throw new BadRequestException('至少需要一个视频或文字片段才能导出');
      }
      const nodes: any[] = [];
      const edges: any[] = [];

      // ── pre-trim video clips (trimIn) into output/ temp files ──
      const trimmedUrls: Record<string, string> = {};
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const trimIn = Math.max(0, Number(v.trimIn) || 0);
        if (trimIn <= 0.05) continue;
        const src = await this.localPathOf(v.url);
        if (!src) {
          this.logger.warn(`Editor #${projectId}: cannot pre-trim remote url, skip trimIn for ${String(v.url).substring(0, 60)}`);
          continue;
        }
        const outName = `editor_trim_${projectId}_${Date.now()}_${i}.mp4`;
        const out = path.join(this.outputDir, outName);
        const dur = Math.max(0.5, Number(v.duration) || 1);
        try {
          await runFfmpegQueued(
            `"${(this.ffmpeg as any).ffmpegPath || 'ffmpeg'}" -y -ss ${trimIn.toFixed(3)} -i "${src}" ` +
            `-t ${dur.toFixed(3)} -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k "${out}"`,
            { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
          );
          trimmedUrls[v.id] = `/static/${outName}`;
          trimFiles.push(out);
        } catch (err: any) {
          this.logger.warn(`Editor #${projectId} pre-trim failed (${err.message}), using source`);
          try { fs.rmSync(out, { force: true }); } catch { /* ignore */ }
        }
      }

      // ── video chain ──
      let prevVideoId: string | null = null;
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const nodeId = `v_${v.id}`;
        const isImg = /\.(jpe?g|png|webp|gif|bmp|svg)(\?|$)/i.test(v.url || '');
        nodes.push({
          id: nodeId,
          type: isImg ? 'image' : 'video',
          position: { x: 60 + i * 260, y: 60 },
          source: { kind: isImg ? 'image' : 'video', url: trimmedUrls[v.id] || v.url },
          duration: Number(v.duration) || 3,
          params: { muted: !!v.muted },
        });
        if (v.filter && v.filter !== 'none') {
          const effId = `ef_${v.id}`;
          nodes.push({
            id: effId,
            type: 'effect',
            position: { x: 60 + i * 260, y: 160 },
            source: {},
            duration: 0,
            params: { kind: 'filter', filter: v.filter },
          });
          edges.push({ id: `e_ef_${v.id}`, from: effId, to: nodeId });
        }
        if (prevVideoId) {
          const prev = videos[i - 1];
          const t = prev.nextTransition && prev.nextTransition.type && prev.nextTransition.type !== 'none'
            ? prev.nextTransition
            : null;
          if (t) {
            const trId = `tr_${i}`;
            nodes.push({
              id: trId,
              type: 'effect',
              position: { x: 60 + i * 260 + 130, y: 60 },
              source: {},
              duration: 0,
              params: { kind: 'transition', transition: t.type, transition_duration: Number(t.duration) || 0.5 },
            });
            edges.push({ id: `e_tr_${i}_a`, from: prevVideoId, to: trId });
            edges.push({ id: `e_tr_${i}_b`, from: trId, to: nodeId });
          } else {
            edges.push({ id: `e_chain_${i}`, from: prevVideoId, to: nodeId });
          }
        }
        prevVideoId = nodeId;
      }

      // ── text overlays ──
      for (const t of tl.text) {
        const nodeId = `t_${t.id}`;
        nodes.push({
          id: nodeId,
          type: 'text',
          position: { x: 60 + (nodes.length % 6) * 200, y: 280 },
          source: {},
          duration: Number(t.duration) || 3,
          params: {
            text: String(t.text),
            start: Number(t.start) || 0,
            x: numOr(t.x, 0.5),
            y: numOr(t.y, 0.5),
            font_size: numOr(t.fontSize, 48),
            text_color: t.color || '#FFFFFF',
            opacity: numOr(t.opacity, 1),
            animation: t.animation || 'fade',
          },
        });
        edges.push({ id: `e_t_${t.id}`, from: nodeId, to: 'output' });
      }

      // ── audio tracks (BGM / narration) ──
      for (const a of tl.audio) {
        const nodeId = `a_${a.id}`;
        nodes.push({
          id: nodeId,
          type: 'audio',
          position: { x: 60 + (nodes.length % 6) * 200, y: 360 },
          source: { kind: 'audio', url: a.url },
          duration: Number(a.duration) || 5,
          params: {
            volume: numOr(a.volume, 0.8),
            start: Number(a.start) || 0,
            fade_in: Number(a.fadeIn) || 0,
            fade_out: Number(a.fadeOut) || 0,
            trim_in: Math.max(0, Number(a.trimIn) || 0),
            duration: Math.max(0.5, Number(a.duration) || 5),
          },
        });
        edges.push({ id: `e_a_${a.id}`, from: nodeId, to: 'output' });
      }

      // ── output node ──
      const outputIdx = 60 + (videos.length + 2) * 260;
      nodes.push({ id: 'output', type: 'output', position: { x: outputIdx, y: 60 }, source: {}, duration: 0, params: {} });
      if (prevVideoId) edges.push({ id: 'e_out_main', from: prevVideoId, to: 'output' });

      const workflowJson = JSON.stringify({ nodes, edges });

      const finalPath = await this.canvasService.renderWorkflowJson({
        refId: projectId,
        ratio: project.ratio || '9:16',
        resolution: project.resolution || '720p',
        nodes: workflowJson,
        workDirPrefix: 'editor_gen',
        finalPrefix: 'editor_result',
        maxClipSeconds: EDITOR_MAX_TOTAL_SECONDS,
        onUpdate: update,
      });

      const stillExists = await this.projectRepo.findOne({ where: { id: projectId } });
      if (!stillExists && finalPath && fs.existsSync(finalPath)) {
        fs.rmSync(finalPath, { force: true });
        this.logger.log(`渲染期间项目 #${projectId} 已删除，清理孤儿成片: ${path.basename(finalPath)}`);
      }
    } catch (err: any) {
      await update({ status: 'failed', error_msg: err.message.substring(0, 500), result_url: null });
      this.logger.error(`Editor render #${projectId} failed: ${err.message}`);
    } finally {
      for (const f of trimFiles) {
        try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
      }
    }
  }

  // ═══════════ Concat (merge two videos) ═══════════

  async concatVideos(urlA: string, urlB: string): Promise<{ url: string; duration: number }> {
    const localA = await this.localPathOf(urlA);
    const localB = await this.localPathOf(urlB);
    if (!localA || !localB) throw new BadRequestException('视频文件不存在或无法访问');

    const mergedPath = await this.ffmpeg.mergeVideos([localA, localB]);
    const rel = path.basename(mergedPath);
    const info = await this.ffmpeg.getVideoInfo(mergedPath);
    return { url: `/static/${rel}`, duration: info?.duration || 0 };
  }

  private async localPathOf(url: string): Promise<string | null> {
    const m = url?.match(/^\/static\/([^?]+)$/);
    if (m) {
      const local = path.resolve(this.outputDir, m[1]);
      if (local.startsWith(this.outputDir + path.sep) && fs.existsSync(local)) return local;
      return null;
    }
    return null; // remote urls can't be pre-trimmed locally
  }

  // ═══════════ Helpers ═══════════

  private parseTimeline(s: string): any {
    if (!s) return normalizeTimeline(null);
    try { return normalizeTimeline(JSON.parse(s)); } catch { return normalizeTimeline(null); }
  }

  private firstVideoUrl(tl: any): string | null {
    const v = tl?.video || [];
    for (const item of v) {
      if (item && item.url) return item.url;
    }
    return null;
  }
}