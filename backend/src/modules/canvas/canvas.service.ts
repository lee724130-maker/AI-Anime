import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { CanvasProject } from './canvas-project.entity';
import { CanvasTemplate } from './canvas-template.entity';
import { FFmpegUtil, runFfmpegQueued } from '../../utils/ffmpeg.util';
import { assertDiskSpace } from '../../common/utils/disk-check.util';
import { assertTemplateWritable, assertCanSetSystemFlag } from '../../common/utils/template-permission.util';
import { downloadToFile } from '../../common/utils/safe-download.util';
import * as fs from 'fs';
import * as path from 'path';

const MIN_DISK_FREE_BYTES = 1024 * 1024 * 1024; // refuse rendering when < 1GB free

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
      return { ...p, nodes, edges: this.parseEdges(p.nodes), cover_url: this.coverFromNodes(nodes) };
    });
  }

  async getProjectById(id: number, userId: number) {
    const p = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!p) throw new NotFoundException('画布项目不存在');
    return { ...p, nodes: this.parseNodes(p.nodes), edges: this.parseEdges(p.nodes) };
  }

  async createProject(userId: number, dto: any) {
    let nodesJson: string = '';
    let ratio = dto.ratio || '9:16';
    let resolution = dto.resolution || '720p';
    let bgmUrl = dto.bgm_url || null;

    // Create from template: substitute variables into nodes
    if (dto.template_id) {
      const tpl = await this.templateRepo.findOne({ where: { id: dto.template_id } });
      if (!tpl) throw new NotFoundException('画布模板不存在');
      const varMap: Record<string, string> = dto.variable_values || {};
      // substitute {{var}} over the full raw JSON (covers nodes + edges + params)
      // JSON-escape values so quotes/backslashes cannot break the nodes JSON
      const varPattern = /\{\{([\w\u4e00-\u9fa5]+)\}\}/g;
      nodesJson = tpl.nodes.replace(varPattern, (m, key) => {
        if (varMap[key] === undefined) return m;
        return JSON.stringify(String(varMap[key])).slice(1, -1);
      });
      const leftover = nodesJson.match(/\{\{([\w\u4e00-\u9fa5]+)\}\}/);
      if (leftover) {
        throw new BadRequestException(`模板变量未填写：{{${leftover[1]}}}，请返回画布列表重新创建`);
      }
      try {
        JSON.parse(nodesJson);
      } catch {
        throw new BadRequestException('模板变量值包含非法字符，无法生成项目');
      }
      ratio = dto.ratio ? dto.ratio : (tpl.ratio || ratio);
      resolution = dto.resolution ? dto.resolution : (tpl.resolution || resolution);
      await this.templateRepo.increment({ id: tpl.id }, 'usage_count', 1);
    } else if (dto.nodes) {
      nodesJson = typeof dto.nodes === 'string' ? dto.nodes : JSON.stringify(dto.nodes);
    }

    if (dto.bgm_url !== undefined) bgmUrl = dto.bgm_url || null;

    const project = this.projectRepo.create({
      user_id: userId,
      name: dto.name || '未命名画布',
      ratio,
      resolution,
      fps: 24,
      nodes: nodesJson,
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
    // Clean leftover render temp dirs for this project
    try {
      const entries = fs.readdirSync(this.outputDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() && e.name.startsWith(`canvas_gen_${id}_`)) {
          fs.rmSync(path.join(this.outputDir, e.name), { recursive: true, force: true });
        }
      }
    } catch { /* ignore */ }
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
    return items.map((t) => ({ ...t, nodes: this.parseNodes(t.nodes), edges: this.parseEdges(t.nodes), variables: this.parseJson(t.variables) }));
  }

  async getTemplateById(id: number) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('画布模板不存在');
    return { ...t, nodes: this.parseNodes(t.nodes), edges: this.parseEdges(t.nodes), variables: this.parseJson(t.variables) };
  }

  async createTemplate(user: any, dto: any) {
    const isSystem = !!dto.is_system;
    assertCanSetSystemFlag(isSystem, user, '画布模板');
    const tpl = this.templateRepo.create({
      user_id: isSystem ? null : user.id,
      name: dto.name,
      description: dto.description || null,
      category: dto.category || '通用',
      ratio: dto.ratio || '9:16',
      resolution: dto.resolution || '720p',
      nodes: typeof dto.nodes === 'string' ? dto.nodes : JSON.stringify(dto.nodes),
      variables: typeof dto.variables === 'string' ? dto.variables : JSON.stringify(dto.variables || []),
      usage_count: 0,
      is_system: isSystem,
      status: 'active',
    });
    await this.templateRepo.save(tpl);
    return this.getTemplateById(tpl.id);
  }

  async updateTemplate(id: number, dto: any, user: any) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('画布模板不存在');
    assertTemplateWritable(t, user, '画布模板');
    if (dto.is_system !== undefined) {
      assertCanSetSystemFlag(!!dto.is_system, user, '画布模板');
      t.is_system = !!dto.is_system;
      if (t.is_system) t.user_id = null;
    }
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

  async deleteTemplate(id: number, user: any) {
    const t = await this.templateRepo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('画布模板不存在');
    assertTemplateWritable(t, user, '画布模板');
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
    const tpl = this.templateRepo.create({
      user_id: userId,
      name: dto.name || `${p.name} 模板`,
      description: dto.description || null,
      category: dto.category || '通用',
      ratio: p.ratio,
      resolution: p.resolution,
      nodes: p.nodes, // preserve full workflow JSON (nodes + edges)
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
   * Render an arbitrary workflow JSON (nodes+edges string) without touching
   * canvas_projects rows. Used by the editor (视频剪辑) module, which stores its
   * own timeline JSON and converts it to a workflow before rendering.
   * Calls back onUpdate() with progress patches ({progress}, {status,...}).
   */
  async renderWorkflowJson(payload: {
    refId: number;
    ratio: string;
    resolution: string;
    bgmUrl?: string;
    nodes: string;
    workDirPrefix?: string;
    finalPrefix?: string;
    maxClipSeconds?: number;
    onUpdate?: (patch: Partial<CanvasProject>) => Promise<void>;
  }): Promise<string | null> {
    const { refId, ratio, resolution, bgmUrl, nodes } = payload;
    const workDirPrefix = payload.workDirPrefix || 'editor_gen';
    const finalPrefix = payload.finalPrefix || 'editor_result';
    const workDir = path.join(this.outputDir, `${workDirPrefix}_${refId}_${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });

    const update = payload.onUpdate || (async () => undefined);
    try {
      const parsed = this.parseWorkflow(nodes);
      if (!parsed.isWorkflow) throw new Error('时间线数据不是有效的工作流 JSON');
      const projectShape = {
        id: refId,
        ratio: ratio || '9:16',
        resolution: resolution || '720p',
        bgm_url: bgmUrl || null,
      } as CanvasProject;
      return await this.renderWorkflow(projectShape, parsed, workDir, update, finalPrefix, payload.maxClipSeconds ?? 15);
    } finally {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  /**
   * Trigger async render. Updates status/progress on the project row.
   * The request returns immediately; the frontend polls getProjectResult.
   */
  async startRender(projectId: number, userId: number) {
    // Deployment guard: refuse when the disk is nearly full
    assertDiskSpace(this.outputDir, MIN_DISK_FREE_BYTES);

    // Atomic claim: only transitions from non-rendering states to rendering,
    // so two concurrent render requests cannot start two pipelines
    const upd = await this.projectRepo.createQueryBuilder()
      .update(CanvasProject)
      .set({ status: 'rendering', progress: 0, error_msg: '' })
      .where('id = :id AND user_id = :uid AND status <> :st', { id: projectId, uid: userId, st: 'rendering' })
      .execute();
    if (!upd.affected) {
      const p = await this.projectRepo.findOne({ where: { id: projectId, user_id: userId } });
      if (!p) throw new NotFoundException('画布项目不存在');
      throw new BadRequestException('项目正在渲染中，请稍候');
    }

    // Fire-and-forget render in background
    this.doRender(projectId).catch((err) => {
      this.logger.error(`Canvas render #${projectId} failed: ${err.message}`);
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
      const parsed = this.parseWorkflow(project.nodes);
      let finalPath: string | null = null;
      if (parsed.isWorkflow) {
        finalPath = await this.renderWorkflow(project, parsed, workDir, update);
      } else {
        finalPath = await this.renderLegacy(project, parsed.legacyNodes, workDir, update);
      }
      // Project deleted mid-render → remove the orphaned result file
      const stillExists = await this.projectRepo.findOne({ where: { id: projectId } });
      if (!stillExists && finalPath && fs.existsSync(finalPath)) {
        fs.rmSync(finalPath, { force: true });
        this.logger.log(`渲染期间项目 #${projectId} 已删除，清理孤儿成片: ${path.basename(finalPath)}`);
      }
    } catch (err: any) {
      await update({ status: 'failed', error_msg: err.message.substring(0, 500), result_url: null });
      this.logger.error(`Canvas render #${projectId} failed: ${err.message}`);
    } finally {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }

  // ═══════════ Workflow render (Coze-style: nodes + edges + overlay tracks) ═══════════

  /**
   * Workflow JSON shape: { nodes: [...], edges: [...] }
   * node: { id, type: video|image|audio|text|effect|output, position:{x,y},
   *         source:{kind,url}, duration, params }
   * edge: { id, from, to }
   * Legacy shape: plain array of { type, source, duration, transition, order }
   */
  private parseWorkflow(nodes: string): {
    isWorkflow: boolean;
    legacyNodes: any[];
    nodes: any[];
    edges: any[];
  } {
    let parsed: any = null;
    try { parsed = JSON.parse(nodes || ''); } catch { parsed = null; }
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return { isWorkflow: true, legacyNodes: [], nodes: parsed.nodes, edges: parsed.edges };
    }
    const legacy = Array.isArray(parsed) ? parsed : [];
    return { isWorkflow: false, legacyNodes: legacy, nodes: [], edges: [] };
  }

  /**
   * Build the main playback chain: video/image nodes connected in order.
   * Order rule: follow edges from chain start (a video/image node with no
   * video/image incoming edge) walking `to` edges to the next video/image.
   */
  private buildMainChain(wfNodes: any[], wfEdges: any[]): any[] {
    const mediaNodes = wfNodes.filter((n: any) => n.type === 'video' || n.type === 'image');
    if (mediaNodes.length === 0) return [];
    const mediaIds = new Set(mediaNodes.map((n) => n.id));
    const outEdges = new Map<string, string[]>();
    const inEdges = new Map<string, string[]>();
    for (const e of wfEdges || []) {
      if (!outEdges.has(e.from)) outEdges.set(e.from, []);
      outEdges.get(e.from)!.push(e.to);
      if (!inEdges.has(e.to)) inEdges.set(e.to, []);
      inEdges.get(e.to)!.push(e.from);
    }
    // find chain starts: media nodes whose media predecessors (from a media in-edge) none
    const starts = mediaNodes.filter((n) => {
      const preds = inEdges.get(n.id) || [];
      return !preds.some((p) => mediaIds.has(p));
    });
    // If nothing starts (cycle), just sort by position.x
    if (starts.length === 0) {
      return [...mediaNodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    }
    // walk chains from each start (avoid revisiting)
    const used = new Set<string>();
    const chain: any[] = [];
    const walk = (nodeId: string) => {
      if (used.has(nodeId)) return;
      used.add(nodeId);
      const node = wfNodes.find((n) => n.id === nodeId);
      if (node) chain.push(node);
      const outs = outEdges.get(nodeId) || [];
      for (const next of outs) {
        if (mediaIds.has(next)) { walk(next); break; }
      }
    };
    starts.sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
    for (const s of starts) walk(s.id);
    // Append any leftover media nodes (shouldn't happen normally)
    for (const n of mediaNodes) if (!used.has(n.id)) chain.push(n);
    return chain;
  }

  /**
   * Find the effect node that bridges clip A → clip B (transition), or the
   * filter effect feeding into a clip.
   */
  private findBridgeEffect(wfNodes: any[], wfEdges: any[], fromId: string, toId: string): any | null {
    const edgesByFrom = new Map<string, string[]>();
    for (const e of wfEdges || []) {
      if (!edgesByFrom.has(e.from)) edgesByFrom.set(e.from, []);
      edgesByFrom.get(e.from)!.push(e.to);
    }
    for (const mid of edgesByFrom.get(fromId) || []) {
      const midNode = wfNodes.find((n) => n.id === mid);
      if (!midNode || midNode.type !== 'effect') continue;
      const outs = edgesByFrom.get(mid) || [];
      if (outs.includes(toId)) return midNode;
    }
    return null;
  }

  private async renderWorkflow(
    project: CanvasProject,
    wf: { nodes: any[]; edges: any[] },
    workDir: string,
    update: (patch: Partial<CanvasProject>) => Promise<void>,
    finalPrefix = 'canvas_result',
    maxClipSeconds = 15,
  ): Promise<string | null> {
    const { nodes: wfNodes, edges: wfEdges } = wf;
    const ratio = project.ratio || '9:16';
    const res = resFromResolution(project.resolution || '720p', ratio);

    const chain = this.buildMainChain(wfNodes, wfEdges);
    const textOverlays = wfNodes.filter((n: any) => n.type === 'text' && n.params?.text);
    const audioNodes = wfNodes.filter((n: any) => n.type === 'audio' && n.source?.url);
    const outputNode = wfNodes.find((n: any) => n.type === 'output');
    if (chain.length === 0 && textOverlays.length === 0) {
      throw new Error('工作流没有视频/图片主链，请连接视频或图片节点');
    }
    this.logger.log(`Workflow render #${project.id}: chain=${chain.length} text=${textOverlays.length} audio=${audioNodes.length}`);

    // ── Step 1: render main chain clips (video/image nodes) ──
    const clips: string[] = [];
    for (let i = 0; i < chain.length; i++) {
      const node = chain[i];
      const dur = this.clampDuration(node.duration, maxClipSeconds);
      try {
        let clip: string | null = null;
        if (node.type === 'image') {
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
          const localPath = await this.downloadToLocal(this.resolveSourceUrl(node), workDir, `vid_${i}`);
          if (!localPath) throw new Error('视频素材下载失败');
          let fitted = await this.ffmpeg.fitVideoToRatio(localPath, ratio, path.join(workDir, `clip_${i}_ratio.mp4`));
          if (fitted === localPath) {
            fitted = path.join(workDir, `clip_${i}_ratio.mp4`);
            fs.copyFileSync(localPath, fitted);
          }
          clip = await this.ffmpeg.fitToExactDuration(fitted, path.join(workDir, `clip_${i}.mp4`), dur);
          clip = await this.normalizeToRes(clip, res, workDir, `clip_${i}_norm`);
        }
        // Apply per-clip filter effect (effect node feeding INTO this clip)
        const filterEffect = (wfEdges || []).find((e: any) => {
          const from = wfNodes.find((n) => n.id === e.from);
          return from && from.type === 'effect' && from.params?.kind === 'filter' && e.to === node.id;
        });
        if (filterEffect) {
          const eff = wfNodes.find((n) => n.id === filterEffect.from);
          if (eff?.params?.filter) {
            clip = await this.applyClipFilter(clip, eff.params.filter, workDir, `clip_${i}_f`);
          }
        }
        if (!clip || !fs.existsSync(clip)) throw new Error('素材块渲染失败');
        clips.push(clip);
      } catch (err: any) {
        throw new Error(`主链第 ${i + 1} 段渲染失败: ${err.message}`);
      }
      await update({ progress: Math.round(((i + 1) / Math.max(chain.length + 4, 4)) * 50) });
    }

    // ── Step 2: merge chain with transitions (bridge effect nodes or node.transition) ──
    await update({ progress: 60 });
    let merged: string;
    if (clips.length === 0) {
      // text-only workflow: build a base canvas long enough for all overlays
      merged = path.join(workDir, 'base_blank.mp4');
      const baseDur = textOverlays.reduce((mx, t) => {
        const start = this.clampNumber(t.params?.start, 0, 60);
        const dur = this.clampDuration(t.params?.duration || t.duration);
        return Math.max(mx, start + dur);
      }, 1);
      await runFfmpegQueued(
        `"${(this.ffmpeg as any).ffmpegPath || 'ffmpeg'}" -y -f lavfi -i "color=c=black:s=${res}:d=${Math.min(baseDur, 60).toFixed(2)}:r=24" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${merged}"`,
        { timeout: 60000 },
      );
    } else if (clips.length === 1) {
      merged = clips[0];
    } else {
      // resolve transitions between chain[i] → chain[i+1]
      const transitions: Array<{ type: string; duration: number } | null> = [];
      for (let i = 0; i < chain.length - 1; i++) {
        let t: any = null;
        const bridge = this.findBridgeEffect(wfNodes, wfEdges, chain[i].id, chain[i + 1].id);
        if (bridge && bridge.params?.transition) {
          t = { type: bridge.params.transition, duration: bridge.params.transition_duration || 0.5 };
        } else if (chain[i + 1]?.transition) {
          t = chain[i + 1].transition;
        }
        transitions.push(t ? { type: String(t.type), duration: Number(t.duration) || 0.5 } : null);
      }
      merged = await this.mergeWithTransitions2(clips, transitions, workDir);
    }

    // ── Step 3: overlay text / image layers on top of the base ──
    await update({ progress: 70 });
    const totalDur = (await this.ffmpeg.getVideoInfo(merged)).duration || 5;
    let base = merged;
    for (let i = 0; i < textOverlays.length; i++) {
      const t = textOverlays[i];
      const start = this.clampNumber(t.params?.start, 0, Math.max(totalDur - 0.1, 0));
      const dur = this.clampDuration(t.params?.duration || t.duration);
      const end = Math.min(start + dur, totalDur);
      try {
        const overlayClip = await this.ffmpeg.generateOverlayTextVideo(t.params.text, {
          textColor: t.params?.text_color || '#FFFFFF',
          fontSize: t.params?.font_size || 48,
          resolution: res,
          duration: end - start,
          x: t.params?.x ?? 0.5,
          y: t.params?.y ?? 0.5,
          opacity: t.params?.opacity ?? 1,
          animation: t.params?.animation || 'fade',
          start,
          outputPath: path.join(workDir, `ovtext_${i}.mov`),
        });
        base = await this.overlayClipOnVideo(base, overlayClip, start, end, workDir, `ov_${i}`);
      } catch (err: any) {
        this.logger.warn(`Text overlay ${i} skipped: ${err.message}`);
      }
      await update({ progress: 70 + Math.round(((i + 1) / (textOverlays.length + 2)) * 10) });
    }

    // ── Step 4: mix audio tracks (audio nodes + BGM) ──
    await update({ progress: 85 });
    const tracks: Array<{ audioPath: string; volume?: number; start?: number; fadeIn?: number; fadeOut?: number }> = [];
    for (const a of audioNodes) {
      const p = await this.downloadToLocal(this.resolveSourceUrl(a), workDir, `aud_${a.id}`);
      if (p) tracks.push({
        audioPath: p,
        volume: a.params?.volume ?? 0.8,
        start: a.params?.start ?? 0,
        fadeIn: a.params?.fade_in || 0,
        fadeOut: a.params?.fade_out || 0,
      });
    }
    if (project.bgm_url) {
      const bgmPath = await this.downloadToLocal(project.bgm_url, workDir, 'bgm');
      if (bgmPath) tracks.push({ audioPath: bgmPath, volume: 0.3, start: 0 });
    }
    if (tracks.length > 0) {
      try {
        base = await this.ffmpeg.mixAudioTracks(base, tracks, path.join(workDir, 'audio_mixed.mp4'));
      } catch (err: any) {
        this.logger.warn(`Audio mix skipped: ${err.message}`);
      }
    }

    // ── Step 5: persist ──
    const finalName = `${finalPrefix}_${project.id}_${Date.now()}.mp4`;
    const finalPath = path.join(this.outputDir, finalName);
    fs.copyFileSync(base, finalPath);
    await update({ status: 'completed', progress: 100, result_url: `/static/${finalName}` });
    this.logger.log(`Workflow render #${project.id} completed: ${finalName}`);
    return finalPath;
  }

  private clampNumber(v: any, min: number, max: number): number {
    const n = Number(v);
    if (isNaN(n)) return min;
    return Math.min(Math.max(n, min), max);
  }

  private async overlayClipOnVideo(base: string, overlay: string, start: number, end: number, workDir: string, prefix: string): Promise<string> {
    const outPath = path.join(workDir, `${prefix}.mp4`);
    const st = start.toFixed(3);
    const en = Math.max(end, start + 0.2).toFixed(3);
    try {
      await runFfmpegQueued(
        `"${(this.ffmpeg as any).ffmpegPath || 'ffmpeg'}" -y -i "${base}" -i "${overlay}" ` +
        `-filter_complex "[1:v]format=rgba,setpts=PTS-STARTPTS+${st}/TB[ov];[0:v][ov]overlay=x=0:y=0:enable='between(t,${st},${en})'[vout]" ` +
        `-map "[vout]" -map 0:a? -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 128k "${outPath}"`,
        { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
      );
      return outPath;
    } catch (err: any) {
      this.logger.warn(`overlayClipOnVideo failed (${err.message}), using base`);
      return base;
    }
  }

  private async applyClipFilter(clip: string, filter: string, workDir: string, prefix: string): Promise<string> {
    const outPath = path.join(workDir, `${prefix}.mp4`);
    const filters: Record<string, string> = {
      grayscale: 'hue=s=0',
      sepia: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0',
      warm: 'colorbalance=rs=.1:gs=.02:bs=-.08',
      cool: 'colorbalance=rs=-.08:gs=.02:bs=.12',
      vintage: 'hue=s=0.7,curves=all=0/0.1:1/0.85',
      bright: 'eq=brightness=0.12',
      dark: 'eq=brightness=-0.12',
      contrast: 'eq=contrast=1.25',
      soft: 'gblur=sigma=1.5,eq=contrast=0.92',
      vivid: 'eq=saturation=1.6:contrast=1.1',
    };
    const vf = filters[filter];
    if (!vf) return clip;
    try {
      await runFfmpegQueued(
        `"${(this.ffmpeg as any).ffmpegPath || 'ffmpeg'}" -y -i "${clip}" -vf "${vf}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a copy "${outPath}"`,
        { timeout: 180000 },
      );
      return outPath;
    } catch (err: any) {
      this.logger.warn(`applyClipFilter ${filter} failed: ${err.message}`);
      return clip;
    }
  }

  private async mergeWithTransitions2(
    clips: string[],
    transitions: Array<{ type: string; duration: number } | null>,
    workDir: string,
  ): Promise<string> {
    // Build pseudo-nodes so the existing mergeWithTransitions logic can be reused
    // (it reads nodes[i + 1].transition = transition AFTER clip i)
    const pseudoNodes: any[] = [null];
    for (let i = 0; i < clips.length - 1; i++) {
      const t = transitions[i] || null;
      pseudoNodes.push(t ? { transition: t } : { transition: null });
    }
    while (pseudoNodes.length < clips.length) pseudoNodes.push({ transition: null });
    return this.mergeWithTransitions(clips, pseudoNodes, workDir);
  }

  private async renderLegacy(
    project: CanvasProject,
    nodes: any[],
    workDir: string,
    update: (patch: Partial<CanvasProject>) => Promise<void>,
  ): Promise<string | null> {
    const sorted = [...nodes].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    const ratio = project.ratio || '9:16';
    const res = resFromResolution(project.resolution || '720p', ratio);
    this.logger.log(`Canvas render #${project.id}: ${sorted.length} nodes, ${ratio} ${res}`);

    if (sorted.length === 0) throw new Error('画布没有素材块，请先添加素材');

    // Step 1: build a clip for every node
    const clips: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const node = sorted[i];
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
          const localPath = await this.downloadToLocal(this.resolveSourceUrl(node), workDir, `vid_${i}`);
          if (!localPath) throw new Error('视频素材下载失败');
          let fitted = await this.ffmpeg.fitVideoToRatio(localPath, ratio, path.join(workDir, `clip_${i}_ratio.mp4`));
          if (fitted === localPath) {
            fitted = path.join(workDir, `clip_${i}_ratio.mp4`);
            fs.copyFileSync(localPath, fitted);
          }
          clip = await this.ffmpeg.fitToExactDuration(fitted, path.join(workDir, `clip_${i}.mp4`), dur);
          clip = await this.normalizeToRes(clip, res, workDir, `clip_${i}_norm`);
        }
        if (!clip || !fs.existsSync(clip)) throw new Error('素材块渲染失败');
        clips.push(clip);
      } catch (err: any) {
        this.logger.error(`Node ${i} failed: ${err.message}`);
        throw new Error(`素材块 ${i + 1} 渲染失败: ${err.message}`);
      }
      await update({ progress: Math.round(((i + 1) / (sorted.length + 2)) * 60) });
    }

    // Step 2: apply transitions between clips
    await update({ progress: 70 });
    let merged: string;
    const hasTransition = sorted.some((n: any) => n.transition && n.transition.type && n.transition.type !== 'none' && n.transition.duration > 0);
    if (clips.length === 1) {
      merged = clips[0];
    } else if (!hasTransition) {
      merged = await this.ffmpeg.mergeVideos(clips);
    } else {
      merged = await this.mergeWithTransitions(clips, sorted, workDir);
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
        this.logger.warn(`Canvas #${project.id} BGM failed: ${err.message}`);
      }
    }

    // Step 4: persist result
    const finalName = `canvas_result_${project.id}_${Date.now()}.mp4`;
    const finalPath = path.join(this.outputDir, finalName);
    fs.copyFileSync(merged, finalPath);
    await update({
      status: 'completed',
      progress: 100,
      result_url: `/static/${finalName}`,
    });
    this.logger.log(`Canvas render #${project.id} completed: ${finalName}`);
    return finalPath;
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
      await runFfmpegQueued(
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
          return await this.ffmpeg.hasAudioTrack(p);
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
    this.logger.log(`mergeWithTransitions: clipDurs=[${clipDurs.map(d => d.toFixed(2))}] afterTransitions=[${afterTransitions.map(a => a.toFixed(2))}]`);
    this.logger.log(`mergeWithTransitions: video filters: ${filters.slice(0, filters.length - 1).join(' ')}`);

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
      await runFfmpegQueued(
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
    try {
      const p = JSON.parse(nodes);
      if (p && Array.isArray(p.nodes)) return p.nodes; // workflow shape
      if (Array.isArray(p)) return p;
      return [];
    } catch { return []; }
  }

  private parseEdges(nodes: string): any[] {
    if (!nodes) return [];
    try {
      const p = JSON.parse(nodes);
      if (p && Array.isArray(p.edges)) return p.edges;
      return [];
    } catch { return []; }
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
      // Only serve http(s) and /static/ URLs as covers (block data:/file:/etc.)
      if (/^https?:\/\//i.test(url) || url.startsWith('/static/')) return url;
    }
    return null;
  }

  private clampDuration(dur: any, max: number = 15): number {
    const d = Number(dur);
    if (!d || isNaN(d)) return 3;
    return Math.min(Math.max(d, 1), max);
  }

  private resolveSourceUrl(node: any): string {
    return node.source?.url || node.url || '';
  }

  private async downloadToLocal(url: string, workDir: string, prefix: string): Promise<string | null> {
    try {
      if (!url) return null;
      // Local static path → map to output dir (reject traversal outside it)
      const staticMatch = url.match(/^\/static\/([^?]+)$/);
      if (staticMatch) {
        const local = path.resolve(this.outputDir, staticMatch[1]);
        if (!local.startsWith(this.outputDir + path.sep)) {
          this.logger.warn(`Static path escapes output dir: ${staticMatch[1]}`);
          return null;
        }
        if (fs.existsSync(local)) return local;
        this.logger.warn(`Static file missing: ${staticMatch[1]}`);
        return null;
      }
      // Absolute local file path → only allow files inside output dir (legacy data)
      if (/^[A-Za-z]:[\\/]/.test(url) || url.startsWith('/')) {
        const resolved = path.resolve(url);
        if (resolved.startsWith(this.outputDir + path.sep) && fs.existsSync(resolved)) return resolved;
        this.logger.warn(`Local path outside output dir or missing: ${url}`);
        return null;
      }
      if (url.startsWith('data:')) return null; // base64, skip
      const ext = /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) ? '.jpg' : '.mp4';
      const localPath = path.join(workDir, `${prefix}_${Date.now()}${ext}`);
      await downloadToFile(url, localPath, { timeoutMs: 60000 });
      return localPath;
    } catch (err: any) {
      this.logger.warn(`Canvas download failed: ${String(url).substring(0, 80)} - ${err.message}`);
      return null;
    }
  }
}
