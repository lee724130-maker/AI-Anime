import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { CanvasProject } from './canvas-project.entity';
import { CanvasTemplate } from './canvas-template.entity';
import { FFmpegUtil } from '../../utils/ffmpeg.util';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function ratioToRes(ratio: string): string {
  switch (ratio) {
    case '16:9': return '1280x720';
    case '1:1': return '1080x1080';
    case '3:4': return '900x1200';
    case '4:3': return '1200x900';
    case '2:3': return '800x1200';
    case '9:16':
    default: return '720x1280';
  }
}

export function resFromResolution(resolution: string, ratio: string): string {
  const base = ratioToRes(ratio);
  const [w, h] = base.split('x').map(Number);
  if (resolution === '480p') {
    const scale = 480 / Math.max(w, h);
    return `${Math.round(w * scale / 2) * 2}x${Math.round(h * scale / 2) * 2}`;
  }
  if (resolution === '1080p') {
    const scale = 1080 / Math.max(w, h);
    return `${Math.round(w * scale / 2) * 2}x${Math.round(h * scale / 2) * 2}`;
  }
  return base; // 720p
}

@Injectable()
export class CanvasService {
  private readonly logger = new Logger(CanvasService.name);
  private readonly outputDir: string;

  constructor(
    @InjectRepository(CanvasProject)
    private readonly projectRepo: Repository<CanvasProject>,
    @InjectRepository(CanvasTemplate)
    private readonly templateRepo: Repository<CanvasTemplate>,
    private readonly ffmpeg: FFmpegUtil,
  ) {
    this.outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
  }

  // ═══════════ Projects ═══════════

  async listProjects(userId: number) {
    const items = await this.projectRepo.find({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
    });
    return items.map((p) => {
      const nodes = this.parseNodes(p.nodes);
      return { ...p, nodes, cover_url: this.coverFromNodes(nodes) };
    });
  }

  async getProjectById(id: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('画布项目不存在');
    return { ...p, nodes: this.parseNodes(p.nodes) };
  }

  async createProject(userId: number, dto: any) {
    let nodes: any[] = [];
    let ratio = dto.ratio || '9:16';
    let resolution = dto.resolution || '720p';
    let bgmUrl = dto.bgm_url || null;

    // Create from template: substitute variables into nodes
    if (dto.template_id) {
      const tpl = await this.templateRepo.findOne({ where: { id: dto.template_id } });
      if (!tpl) throw new NotFoundException('画布模板不存在');
      const tplNodes = this.parseNodes(tpl.nodes);
      const varMap: Record<string, string> = dto.variable_values || {};
      nodes = tplNodes.map((n: any) => JSON.parse(JSON.stringify(n).replace(/\{\{(\w+)\}\}/g, (m, key) => {
        return varMap[key] !== undefined ? varMap[key] : m;
      })));
      // Keep template params as defaults when not overridden
      ratio = ratio === '9:16' ? tpl.ratio || ratio : ratio;
      resolution = resolution === '720p' ? tpl.resolution || resolution : resolution;
      await this.templateRepo.increment({ id: tpl.id }, 'usage_count', 1);
    } else if (dto.nodes) {
      nodes = this.parseNodes(dto.nodes);
    }

    if (dto.bgm_url !== undefined) bgmUrl = dto.bgm_url || null;

    const project = this.projectRepo.create({
      user_id: userId,
      name: dto.name || '未命名画布',
      ratio,
      resolution,
      fps: 24,
      nodes: JSON.stringify(nodes),
      bgm_url: bgmUrl,
      status: 'pending',
      progress: 0,
    });
    await this.projectRepo.save(project);
    return this.getProjectById(project.id, userId);
  }

  async updateProject(id: number, userId: number, dto: any) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('画布项目不存在');
    if (dto.name !== undefined) p.name = dto.name;
    if (dto.ratio !== undefined) p.ratio = dto.ratio;
    if (dto.resolution !== undefined) p.resolution = dto.resolution;
    if (dto.nodes !== undefined) p.nodes = typeof dto.nodes === 'string' ? dto.nodes : JSON.stringify(dto.nodes);
    if (dto.bgm_url !== undefined) p.bgm_url = dto.bgm_url || null;
    await this.projectRepo.save(p);
    return this.getProjectById(id, userId);
  }

  async deleteProject(id: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('画布项目不存在');
    // Remove rendered result file if it exists locally
    if (p.result_url) {
      const m = p.result_url.match(/\/static\/([^/]+)$/);
      if (m) {
        try { fs.rmSync(path.join(this.outputDir, m[1]), { force: true }); } catch { /* ignore */ }
      }
    }
    await this.projectRepo.remove(p);
    return { success: true };
  }

  async getProjectResult(id: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('画布项目不存在');
    return {
      id: p.id,
      status: p.status,
      progress: p.progress,
      result_url: p.result_url,
      error_msg: p.error_msg,
    };
  }

  // ═══════════ Templates ═══════════

  async listTemplates(query: any) {
    const { category, keyword } = query;
    const where: any = { status: 'active' };
    if (category && category !== 'all') where.category = category;
    if (keyword) where.name = Like(`%${keyword}%`);
    const items = await this.templateRepo.find({ where, order: { created_at: 'DESC' } });
    return items.map((t) => ({ ...t, nodes: this.parseNodes(t.nodes), variables: this.parseJson(t.variables) }));
  }

  async getTemplateById(id: number) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('画布模板不存在');
    return { ...t, nodes: this.parseNodes(t.nodes), variables: this.parseJson(t.variables) };
  }

  async createTemplate(userId: number, dto: any) {
    const tpl = this.templateRepo.create({
      user_id: dto.is_system ? null : userId,
      name: dto.name,
      description: dto.description || null,
      category: dto.category || '通用',
      ratio: dto.ratio || '9:16',
      resolution: dto.resolution || '720p',
      nodes: typeof dto.nodes === 'string' ? dto.nodes : JSON.stringify(dto.nodes),
      variables: typeof dto.variables === 'string' ? dto.variables : JSON.stringify(dto.variables || []),
      usage_count: 0,
      is_system: !!dto.is_system,
      status: 'active',
    });
    await this.templateRepo.save(tpl);
    return this.getTemplateById(tpl.id);
  }

  async updateTemplate(id: number, dto: any) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('画布模板不存在');
    if (dto.name !== undefined) t.name = dto.name;
    if (dto.description !== undefined) t.description = dto.description;
    if (dto.category !== undefined) t.category = dto.category;
    if (dto.ratio !== undefined) t.ratio = dto.ratio;
    if (dto.resolution !== undefined) t.resolution = dto.resolution;
    if (dto.nodes !== undefined) t.nodes = typeof dto.nodes === 'string' ? dto.nodes : JSON.stringify(dto.nodes);
    if (dto.variables !== undefined) t.variables = typeof dto.variables === 'string' ? dto.variables : JSON.stringify(dto.variables);
    if (dto.status !== undefined) t.status = dto.status;
    await this.templateRepo.save(t);
    return this.getTemplateById(id);
  }

  async deleteTemplate(id: number) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('画布模板不存在');
    await this.templateRepo.remove(t);
    return { success: true };
  }

  async duplicateTemplate(userId: number, id: number) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('画布模板不存在');
    const copy = this.templateRepo.create({
      user_id: userId,
      name: `${t.name} (副本)`,
      description: t.description,
      category: t.category,
      ratio: t.ratio,
      resolution: t.resolution,
      nodes: t.nodes,
      variables: t.variables,
      usage_count: 0,
      is_system: false,
      status: 'active',
    });
    await this.templateRepo.save(copy);
    return this.getTemplateById(copy.id);
  }

  async saveAsTemplate(projectId: number, userId: number, dto: any) {
    const p = await this.projectRepo.findOne({ where: { id: projectId, user_id: userId } });
    if (!p) throw new NotFoundException('画布项目不存在');
    const nodes = this.parseNodes(p.nodes);
    const tpl = this.templateRepo.create({
      user_id: userId,
      name: dto.name || `${p.name} 模板`,
      description: dto.description || null,
      category: dto.category || '通用',
      ratio: p.ratio,
      resolution: p.resolution,
      nodes: JSON.stringify(nodes),
      variables: JSON.stringify(dto.variables || []),
      usage_count: 0,
      is_system: false,
      status: 'active',
    });
    await this.templateRepo.save(tpl);
    return this.getTemplateById(tpl.id);
  }

  // ═══════════ Render engine ═══════════

  /**
   * Trigger async render. Updates status/progress on the project row.
   * The request returns immediately; the frontend polls getProjectResult.
   */
  async startRender(projectId: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id: projectId, user_id: userId } });
    if (!p) throw new NotFoundException('画布项目不存在');
    if (p.status === 'rendering') {
      throw new BadRequestException('项目正在渲染中，请稍候');
    }
    p.status = 'rendering';
    p.progress = 0;
    p.error_msg = '';
    await this.projectRepo.save(p);

    // Fire-and-forget render in background
    this.doRender(p.id).catch((err) => {
      this.logger.error(`Canvas render #${p.id} failed: ${err.message}`);
    });
    return { status: 'rendering', progress: 0 };
  }

  private async doRender(projectId: number) {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) return;

    const workDir = path.join(this.outputDir, `canvas_gen_${projectId}_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const update = async (patch: Partial<CanvasProject>) => {
      const row = await this.projectRepo.findOne({ where: { id: projectId } });
      if (!row) return;
      Object.assign(row, patch);
      await this.projectRepo.save(row);
    };

    try {
      const nodes = this.parseNodes(project.nodes).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
      const ratio = project.ratio || '9:16';
      const res = resFromResolution(project.resolution || '720p', ratio);
      this.logger.log(`Canvas render #${projectId}: ${nodes.length} nodes, ${ratio} ${res}`);

      if (nodes.length === 0) throw new Error('画布没有素材块，请先添加素材');

      // Step 1: build a clip for every node
      const clips: string[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const dur = this.clampDuration(node.duration);
        try {
          let clip: string | null = null;
          if (node.type === 'text') {
            const text = node.params?.text || node.text || '';
            if (!text) throw new Error('文字块内容为空');
            clip = await this.ffmpeg.generateTextVideo(text, {
              duration: dur,
              resolution: res,
              bgColor: node.params?.bg_color || '#7C3AED',
              textColor: node.params?.text_color || '#FFFFFF',
              fontSize: node.params?.font_size || 48,
              outputPath: path.join(workDir, `clip_${i}.mp4`),
            });
          } else if (node.type === 'image') {
            const localPath = await this.downloadToLocal(this.resolveSourceUrl(node), workDir, `img_${i}`);
            if (!localPath) throw new Error('图片素材下载失败');
            clip = await this.ffmpeg.composite({
              imagePaths: [localPath],
              duration: dur,
              fps: 24,
              resolution: res,
              outputPath: path.join(workDir, `clip_${i}.mp4`),
            });
          } else {
            // video
            const localPath = await this.downloadToLocal(this.resolveSourceUrl(node), workDir, `vid_${i}`);
            if (!localPath) throw new Error('视频素材下载失败');
            let fitted = await this.ffmpeg.fitVideoToRatio(localPath, ratio, path.join(workDir, `clip_${i}_ratio.mp4`));
            if (fitted === localPath) {
              // no-op (already matching ratio) — copy to a workDir file so clip list is uniform
              fitted = path.join(workDir, `clip_${i}_ratio.mp4`);
              fs.copyFileSync(localPath, fitted);
            }
            clip = await this.ffmpeg.fitToExactDuration(fitted, path.join(workDir, `clip_${i}.mp4`), dur);
            // Normalize to the project's target resolution so that xfade/concat
            // between clips never hits size mismatches (ratio fitting may shrink)
            clip = await this.normalizeToRes(clip, res, workDir, `clip_${i}_norm`);
          }
          if (!clip || !fs.existsSync(clip)) throw new Error('素材块渲染失败');
          clips.push(clip);
        } catch (err: any) {
          this.logger.error(`Node ${i} failed: ${err.message}`);
          throw new Error(`素材块 ${i + 1} 渲染失败: ${err.message}`);
        }
        await update({ progress: Math.round(((i + 1) / (nodes.length + 2)) * 60) });
      }

      // Step 2: apply transitions between clips (xfade for adjacent clips with transitions)
      await update({ progress: 70 });
      let merged: string;
      const hasTransition = nodes.some((n: any) => n.transition && n.transition.type && n.transition.type !== 'none' && n.transition.duration > 0);
      if (clips.length === 1) {
        merged = clips[0];
      } else if (!hasTransition) {
        merged = await this.ffmpeg.mergeVideos(clips);
      } else {
        merged = await this.mergeWithTransitions(clips, nodes, workDir);
      }

      // Step 3: BGM overlay
      await update({ progress: 85 });
      if (project.bgm_url) {
        try {
          const bgmPath = await this.downloadToLocal(project.bgm_url, workDir, 'bgm');
          if (bgmPath) {
            merged = await this.ffmpeg.compositeVideoWithAudio(merged, bgmPath);
          }
        } catch (err: any) {
          this.logger.warn(`Canvas #${projectId} BGM failed: ${err.message}`);
        }
      }

      // Step 4: persist result
      const finalName = `canvas_result_${projectId}_${Date.now()}.mp4`;
      const finalPath = path.join(this.outputDir, finalName);
      fs.copyFileSync(merged, finalPath);
      await update({
        status: 'completed',
        progress: 100,
        result_url: `/static/${finalName}`,
      });
      this.logger.log(`Canvas render #${projectId} completed: ${finalName}`);
    } catch (err: any) {
      await update({ status: 'failed', error_msg: err.message.substring(0, 500) });
      this.logger.error(`Canvas render #${projectId} failed: ${err.message}`);
    } finally {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Scale a clip to an exact target resolution (e.g. 720x1280), cropping to
   * fill. Used to unify clip sizes before xfade/concat merging.
   */
  private async normalizeToRes(inputPath: string, res: string, workDir: string, prefix: string): Promise<string> {
    try {
      const info = await this.ffmpeg.getVideoInfo(inputPath);
      if (!info.width || !info.height) return inputPath;
      const [tw, th] = res.split('x').map(Number);
      if (!tw || !th) return inputPath;
      if (info.width === tw && info.height === th) return inputPath; // already exact
      const outPath = path.join(workDir, `${prefix}_${Date.now()}.mp4`);
      await execAsync(
        `"${(this.ffmpeg as any).ffmpegPath || 'ffmpeg'}" -y -i "${inputPath}" ` +
        `-vf "scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},setsar=1" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 24 ` +
        `-c:a aac -b:a 128k "${outPath}"`,
        { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
      );
      return outPath;
    } catch (err: any) {
      this.logger.warn(`normalizeToRes failed (${err.message}), using original clip`);
      return inputPath;
    }
  }

  /**
   * Merge clips applying xfade transitions between adjacent clips.
   * Uses the (upgraded) ffmpeg 6.x binary which supports xfade.
   * Video: chained xfade; Audio: each segment trimmed to its used length
   * (original length minus the transition it feeds into) then concat.
   * Falls back to plain merge on any failure.
   */
  private async mergeWithTransitions(clips: string[], nodes: any[], workDir: string): Promise<string> {
    const transitionMap: Record<string, string> = {
      fade: 'fade',
      fade_black: 'fadeblack',
      fade_white: 'fadewhite',
      dissolve: 'fade',
      wipe_left: 'wipeleft',
      wipe_right: 'wiperight',
      slide_left: 'slideleft',
      slide_right: 'slideright',
      circle: 'circlecrop',
    };

    // Effective transition duration after clip i (i.e. what the tail of clip i overlaps with clip i+1)
    const afterTransitions: number[] = clips.map((_, i) => {
      if (i === clips.length - 1) return 0;
      const t = nodes[i + 1]?.transition || {};
      const type = transitionMap[t.type];
      const d = Number(t.duration);
      return type && d > 0 ? Math.min(d, 1.5) : 0;
    });

    const clipDurs: number[] = [];
    for (const c of clips) {
      try {
        const info = await this.ffmpeg.getVideoInfo(c);
        clipDurs.push(info.duration || 3);
      } catch {
        clipDurs.push(3);
      }
    }

    // Which inputs carry an audio track
    const hasAudio = await Promise.all(
      clips.map(async (p) => {
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${p}"`,
            { timeout: 10000 },
          );
          return stdout.trim().length > 0;
        } catch {
          return false;
        }
      }),
    );

    const inputs = clips.map((c) => `-i "${c}"`).join(' ');
    const filters: string[] = [];

    // ── Video chain ──
    let prev = '[0:v]';
    let cumulative = 0;
    for (let i = 0; i < clips.length - 1; i++) {
      cumulative += clipDurs[i];
      const d = afterTransitions[i];
      const outLabel = i === clips.length - 2 ? '[vout]' : `[vx${i}]`;
      if (d > 0) {
        const offset = Math.max(0.1, cumulative - d);
        filters.push(`${prev}[${i + 1}:v]xfade=transition=${transitionMap[nodes[i + 1].transition.type]}:duration=${d}:offset=${offset.toFixed(2)}${outLabel}`);
      } else {
        filters.push(`${prev}[${i + 1}:v]concat=n=2:v=1:a=0${outLabel}`);
      }
      prev = outLabel;
    }

    // ── Audio chain: each segment trimmed to used length, then concat ──
    const audioParts: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const usedLen = Math.max(0.2, clipDurs[i] - afterTransitions[i]);
      if (hasAudio[i]) {
        audioParts.push(`[${i}:a]atrim=0:${usedLen.toFixed(2)},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`);
      } else {
        audioParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${usedLen.toFixed(2)},asetpts=PTS-STARTPTS[a${i}]`);
      }
    }
    const audioConcatIn = clips.map((_, i) => `[a${i}]`).join('');
    filters.push(`${audioParts.join(';')};${audioConcatIn}concat=n=${clips.length}:v=0:a=1[aout]`);

    const outPath = path.join(workDir, 'merged_transitions.mp4');
    try {
      const ffmpegPath = (this.ffmpeg as any).ffmpegPath || 'ffmpeg';
      await execAsync(
        `"${ffmpegPath}" -y ${inputs} -filter_complex "${filters.join(';')}" -map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 24 -c:a aac -b:a 128k -movflags +faststart "${outPath}"`,
        { timeout: 600000, maxBuffer: 50 * 1024 * 1024 },
      );
      this.logger.log(`Canvas xfade merge done: ${outPath}`);
      return outPath;
    } catch (err: any) {
      this.logger.warn(`Canvas xfade merge failed (${err.message}), falling back to plain merge`);
      return this.ffmpeg.mergeVideos(clips);
    }
  }

  // ═══════════ Helpers ═══════════

  private parseNodes(nodes: string): any[] {
    if (!nodes) return [];
    try { return JSON.parse(nodes); } catch { return []; }
  }

  private parseJson(s: string): any {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  }

  private coverFromNodes(nodes: any[]): string | null {
    for (const n of nodes || []) {
      const url = n.source?.url || n.url;
      if (!url) continue;
      // Absolute local path (e.g. C:\...\backend\output\x.mp4) → /static/ URL
      if ((/^[A-Za-z]:[\\/]/.test(url) || url.startsWith('/')) && !url.startsWith('/static/')) {
        const m = url.replace(/\\/g, '/').match(/([^/]+\.(mp4|webm|mov|jpg|jpeg|png|webp|gif))$/i);
        if (m) return `/static/${m[1]}`;
      }
      return url;
    }
    return null;
  }

  private clampDuration(dur: any): number {
    const d = Number(dur);
    if (!d || isNaN(d)) return 3;
    return Math.min(Math.max(d, 1), 15);
  }

  private resolveSourceUrl(node: any): string {
    return node.source?.url || node.url || '';
  }

  private async downloadToLocal(url: string, workDir: string, prefix: string): Promise<string | null> {
    try {
      if (!url) return null;
      // Local static path → map to output dir
      const staticMatch = url.match(/^\/static\/([^?]+)$/);
      if (staticMatch) {
        const local = path.join(this.outputDir, staticMatch[1]);
        if (fs.existsSync(local)) return local;
        this.logger.warn(`Static file missing: ${staticMatch[1]}`);
        return null;
      }
      // Absolute local file path (Windows/Linux) → use directly if it exists
      if ((/^[A-Za-z]:[\\/]/.test(url) || url.startsWith('/')) && fs.existsSync(url)) {
        return url;
      }
      if (url.startsWith('data:')) return null; // base64, skip
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      const ext = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) ? '.jpg' : '.mp4';
      const localPath = path.join(workDir, `${prefix}_${Date.now()}${ext}`);
      fs.writeFileSync(localPath, Buffer.from(response.data));
      return localPath;
    } catch (err: any) {
      this.logger.warn(`Canvas download failed: ${String(url).substring(0, 80)} - ${err.message}`);
      return null;
    }
  }
}
