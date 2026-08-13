import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { DramaProject } from './drama-project.entity';
import { DramaOutline } from './drama-outline.entity';
import { DramaEpisode } from './drama-episode.entity';
import { DramaSegment } from './drama-segment.entity';
import { DramaSegmentCandidate } from './drama-segment-candidate.entity';
import { DramaAsset } from './drama-asset.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { PromptTemplateService } from '../admin/prompt-template.service';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { FFmpegUtil } from '../../utils/ffmpeg.util';
import { downloadToFile } from '../../common/utils/safe-download.util';
import { CreditsService } from '../credits/credits.service';
import type { Queue } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class DramaService {
  private readonly logger = new Logger(DramaService.name);

  constructor(
    @InjectRepository(DramaProject)
    private readonly projectRepo: Repository<DramaProject>,
    @InjectRepository(DramaOutline)
    private readonly outlineRepo: Repository<DramaOutline>,
    @InjectRepository(DramaEpisode)
    private readonly episodeRepo: Repository<DramaEpisode>,
    @InjectRepository(DramaSegment)
    private readonly segmentRepo: Repository<DramaSegment>,
    @InjectRepository(DramaAsset)
    private readonly assetRepo: Repository<DramaAsset>,
    @InjectRepository(DramaSegmentCandidate)
    private readonly candidateRepo: Repository<DramaSegmentCandidate>,
    @InjectRepository(GlobalAsset)
    private readonly globalAssetRepo: Repository<GlobalAsset>,
    private readonly aiService: AIServiceUtil,
    private readonly templateService: PromptTemplateService,
    private readonly ffmpeg: FFmpegUtil,
    private readonly credits: CreditsService,
    @InjectQueue('drama-segment')
    private readonly segmentQueue: Queue,
  ) {}

  /** 短剧工作室积分扣费规则（供前端展示） */
  getDramaCreditRules() {
    return this.credits.getDramaCreditRules();
  }

  async list(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.projectRepo.findAndCount({
      where: { user_id: userId },
      order: { updated_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(userId: number, id: number) {
    const project = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!project) throw new NotFoundException('短剧项目不存在');
    return project;
  }

  async create(userId: number, data: Partial<DramaProject> & { style?: string }) {
    if (data.style) {
      data.target_style = data.style;
      delete (data as any).style;
    }
    const project = this.projectRepo.create({ ...data, user_id: userId });
    return this.projectRepo.save(project);
  }

  async update(userId: number, id: number, data: Partial<DramaProject>) {
    const project = await this.getById(userId, id);
    Object.assign(project, data);
    return this.projectRepo.save(project);
  }

  async delete(userId: number, id: number) {
    const project = await this.getById(userId, id);
    await this.assetRepo.delete({ project_id: id });
    const episodes = await this.episodeRepo.find({ where: { project_id: id } });
    for (const ep of episodes) {
      await this.segmentRepo.delete({ episode_id: ep.id });
    }
    await this.episodeRepo.delete({ project_id: id });
    await this.outlineRepo.delete({ project_id: id });
    await this.projectRepo.remove(project);
    return { deleted: true };
  }

  async analyze(userId: number, projectId: number) {
    const project = await this.getById(userId, projectId);
    if (!project.outline) throw new BadRequestException('请先输入剧本大纲');

    const templates = await this.templateService.find(undefined, undefined);
    const analyzeTemplate = templates.find((t: any) => t.name === '剧本分析模板');
    if (!analyzeTemplate) throw new BadRequestException('系统未配置剧本分析模板');
    const expandTemplate = templates.find((t: any) => t.name === '剧本分段扩展模板');
    if (!expandTemplate) throw new BadRequestException('系统未配置剧本分段扩展模板');

    // Credit charge: 剧情分析 5 分/次（预扣，失败退全款）
    const analyzeCost = await this.credits.dramaAnalyzeCost();
    await this.credits.assertEnough(userId, analyzeCost, '剧情分析');

    let outline = await this.outlineRepo.findOne({ where: { project_id: projectId } });
    if (!outline) {
      outline = this.outlineRepo.create({ project_id: projectId, outline: project.outline, status: 'analyzing' });
    } else {
      outline.outline = project.outline;
      outline.status = 'analyzing';
    }
    await this.outlineRepo.save(outline);

    try {
      // ── 阶段 1：结构分析（标题/风格/每集概述/全局资产清单）──
      const targetCount = Math.min(Math.max(project.episodes || 12, 1), 24);
      const styleName = project.target_style === 'realistic' ? '写实风格（realistic，真实拍摄质感，严禁动漫/插画/二次元词汇）' : '动漫风格（anime style，日系动画质感）';
      const projectReq = [
        project.genre ? `题材：${project.genre}` : '',
        project.target_style ? `风格：${styleName}` : '',
        `目标集数：${targetCount} 集`,
      ].filter(Boolean).join('；');
      const structurePrompt = analyzeTemplate.template
        .replace('{{outline}}', `${projectReq}\n\n剧本大纲：\n${project.outline}`)
        .replace('{{episodeCount}}', String(targetCount));

      const rawStructure = await this.aiService.chatCompletion(
        [{ role: 'user', content: structurePrompt }],
        { temperature: 0.3, maxTokens: 8192 },
      );
      if (!rawStructure || rawStructure.trim() === '') {
        throw new Error('LLM 返回了空结果，请检查 API Key 是否已配置且可用');
      }
      outline.raw_response = rawStructure;

      const structure = this.parseStructured(rawStructure);
      this.validateAnalysis(structure);
      // 用户指定的风格优先（创建项目时可选动漫/写实），未指定才用 LLM 判断
      if (project.target_style) {
        structure.style = project.target_style;
      }
      const episodes = structure.episodes || [];
      if (episodes.length > 0 && episodes.length !== (structure.episodeCount || 0)) {
        structure.episodeCount = episodes.length;
      }
      if (episodes.length < targetCount) {
        this.logger.warn(`剧本分析: 目标 ${targetCount} 集，LLM 实际输出 ${episodes.length} 集`);
      }

      // ── 阶段 2：逐批分段扩展（每批 3 集并行，避免单次输出超限）──
      const globalAssets = JSON.stringify({
        characters: (structure.assets?.characters || []).map((c: any) => ({ name: c.name, description: c.description })),
        props: (structure.assets?.props || []).map((p: any) => ({ name: p.name, description: p.description })),
        scenes: (structure.assets?.scenes || []).map((s: any) => ({ name: s.name, description: s.description })),
      });

      // 每批 3 集并行（阶段 2 显式走 qwen-plus，3 并发生产已验证；GLM 并发上限问题仅在阶段 1 单发，不受影响）
      const batchSize = 3;
      for (let i = 0; i < episodes.length; i += batchSize) {
        const batch = episodes.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (ep: any) => {
            const expandPrompt = expandTemplate.template
              .replace('{{episodeInfo}}', JSON.stringify({
                episodeNo: ep.episodeNo, title: ep.title, summary: ep.summary, duration: ep.duration,
              }))
              .replace('{{globalAssets}}', globalAssets)
              + `\n\n画面风格要求：${styleName}（prompt 中必须体现该风格词汇）`;
            const raw = await this.aiService.chatCompletion(
              [{ role: 'user', content: expandPrompt }],
              // 阶段 2 属批量机械扩展：显式用 qwen-plus（快、已验证质量足够），阶段 1 的智能结构走 GLM-4.5-Air
              { temperature: 0.3, maxTokens: 4096, model: 'qwen-plus' },
            );
            if (!raw || raw.trim() === '') {
              throw new Error('LLM 返回了空结果，请检查 API Key 是否已配置且可用');
            }
            const parsed = this.parseStructured(raw);
            if (!parsed.episodeNo) parsed.episodeNo = ep.episodeNo;
            return parsed;          }),
        );
        for (const r of batchResults) {
          const ep = episodes.find((e: any) => String(e.episodeNo) === String(r.episodeNo));
          if (ep) ep.segments = r.segments || [];
        }
      }

      // 兜底：片段引用了但 assets 未定义的资产 → 自动补入（供前端展示/编辑）
      this.mergeUnknownAssetRefs(structure);

      // 兜底：prompt 应为纯英文（模板约束失效时防止中文残留进 AI 视频生成提示词）
      this.sanitizePrompts(structure);

      this.validateAnalysis(structure);

      outline.structured_result = JSON.stringify(structure);
      outline.status = 'completed';
      await this.outlineRepo.save(outline);

      project.status = 'analysis_done';
      await this.projectRepo.save(project);

      return structure;
    } catch (err: any) {
      outline.status = 'failed';
      if (outline.raw_response) {
        this.logger.error(`Analysis raw response: ${outline.raw_response.substring(0, 500)}`);
      }
      await this.outlineRepo.save(outline);
      // 分析失败 → 退全款
      await this.credits.refund(userId, analyzeCost).catch(() => undefined);
      const msg = err.message.includes('JSON')
        ? `AI 返回内容无法解析为有效 JSON，请重试或检查 LLM 配置。原始返回：${(outline.raw_response || '').substring(0, 200)}`
        : err.message;
      throw new BadRequestException(`分析失败: ${msg}`);
    }
  }

  async getAnalysis(userId: number, projectId: number) {
    await this.getById(userId, projectId);
    const outline = await this.outlineRepo.findOne({ where: { project_id: projectId } });
    if (!outline) throw new NotFoundException('尚未进行分析');
    if (outline.status !== 'completed') throw new BadRequestException(`分析尚未完成（${outline.status}）`);
    return {
      raw_response: outline.raw_response,
      structured_result: JSON.parse(outline.structured_result || '{}'),
      status: outline.status,
    };
  }

  async saveAnalysis(userId: number, projectId: number, data: { structured_result: any }) {
    const project = await this.getById(userId, projectId);
    const outline = await this.outlineRepo.findOne({ where: { project_id: projectId } });
    if (!outline) throw new NotFoundException('尚未进行分析');

    outline.structured_result = JSON.stringify(data.structured_result);
    await this.outlineRepo.save(outline);
    return data.structured_result;
  }

  async confirmAnalysis(userId: number, projectId: number) {
    const project = await this.getById(userId, projectId);
    const outline = await this.outlineRepo.findOne({ where: { project_id: projectId } });
    if (!outline || !outline.structured_result) throw new BadRequestException('尚无完成的分析结果');

    const result = JSON.parse(outline.structured_result);

    project.title = result.title || project.title;
    project.genre = result.genre || project.genre;
    project.episodes = result.episodeCount || project.episodes;
    if (result.style) project.target_style = result.style;
    project.status = 'analysis_done';
    await this.projectRepo.save(project);

    await this.episodeRepo.delete({ project_id: projectId });
    const episodes = (result.episodes || []).map((ep: any, i: number) =>
      this.episodeRepo.create({
        project_id: projectId,
        episode_no: ep.episodeNo || i + 1,
        title: ep.title || `第${i + 1}集`,
        summary: ep.summary || '',
        duration: ep.duration || 60,
        style: result.style || project.target_style || 'anime',
      })
    );
    const savedEpisodes = await this.episodeRepo.save(episodes);

    for (const ep of savedEpisodes) {
      const epData = (result.episodes || []).find((e: any) => (e.episodeNo || 0) === ep.episode_no);
      if (epData?.segments) {
        const segments = epData.segments.map((seg: any) =>
          this.segmentRepo.create({
            episode_id: ep.id,
            segment_no: seg.segmentNo,
            summary: seg.summary || '',
            prompt: seg.prompt || '',
            prompt_cn: seg.prompt_cn || '',
            character_refs: JSON.stringify(seg.characters || []),
            prop_refs: JSON.stringify(seg.props || []),
            scene_refs: JSON.stringify(seg.scenes || []),
            duration: seg.duration || 5,
          })
        );
        await this.segmentRepo.save(segments);
      }
    }

    if (result.assets) {
      await this.assetRepo.delete({ project_id: projectId });
      const assets: DramaAsset[] = [];
      if (result.assets.characters) {
        for (const c of result.assets.characters) {
          assets.push(this.assetRepo.create({
            project_id: projectId, type: 'character',
            name: c.name, description: c.description, prompt: c.prompt, prompt_cn: c.prompt_cn,
          }));
        }
      }
      if (result.assets.props) {
        for (const p of result.assets.props) {
          assets.push(this.assetRepo.create({
            project_id: projectId, type: 'prop',
            name: p.name, description: p.description, prompt: p.prompt, prompt_cn: p.prompt_cn,
          }));
        }
      }
      if (result.assets.scenes) {
        for (const s of result.assets.scenes) {
          assets.push(this.assetRepo.create({
            project_id: projectId, type: 'scene',
            name: s.name, description: s.description, prompt: s.prompt, prompt_cn: s.prompt_cn,
          }));
        }
      }
      if (assets.length) await this.assetRepo.save(assets);
    }

    return { status: 'analysis_done', episodeCount: savedEpisodes.length };
  }

  /** 重新生成指定片段（编辑分析结果用）：复用分段扩展模板，喂入当前集信息保持剧情连贯，不写库由前端保存 */
  async regenerateSegment(userId: number, projectId: number, dto: { episodeNo: number; segmentNo?: number }) {
    const project = await this.getById(userId, projectId);
    const outline = await this.outlineRepo.findOne({ where: { project_id: projectId } });
    if (!outline?.structured_result) throw new BadRequestException('尚未进行分析，请先点击 AI 分析');

    const result = JSON.parse(outline.structured_result);
    const ep = (result.episodes || []).find((e: any) => String(e.episodeNo) === String(dto.episodeNo));
    if (!ep) throw new BadRequestException('分集不存在');

    const templates = await this.templateService.find(undefined, undefined);
    const expandTemplate = templates.find((t: any) => t.name === '剧本分段扩展模板');
    if (!expandTemplate) throw new BadRequestException('系统未配置剧本分段扩展模板');

    const globalAssets = JSON.stringify({
      characters: (result.assets?.characters || []).map((c: any) => ({ name: c.name, description: c.description })),
      props: (result.assets?.props || []).map((p: any) => ({ name: p.name, description: p.description })),
      scenes: (result.assets?.scenes || []).map((s: any) => ({ name: s.name, description: s.description })),
    });

    const current = (ep.segments || []).find((s: any) => String(s.segmentNo) === String(dto.segmentNo));
    const episodeInfo = {
      episodeNo: ep.episodeNo,
      title: ep.title,
      summary: ep.summary,
      duration: ep.duration,
      currentSegments: ep.segments || [],
      regenerate: current
        ? `用户对第 ${dto.segmentNo} 个片段不满意，请重新创作该片段：必须与同一集中其他片段的剧情连贯衔接，输出 1 个全新的片段（原片段剧情：${current.summary}）`
        : '本集尚未有片段，请按正常流程拆分 1-2 个片段',
    };

    const prompt = expandTemplate.template
      .replace('{{episodeInfo}}', JSON.stringify(episodeInfo))
      .replace('{{globalAssets}}', globalAssets)
      + `\n\n画面风格要求：${project.target_style === 'realistic'
        ? '写实风格（realistic，真实拍摄质感，严禁动漫/插画/二次元词汇，prompt 必须体现写实词汇）'
        : '动漫风格（anime style，日系动画质感，prompt 必须体现 anime style）'}`;

    const raw = await this.aiService.chatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.7, maxTokens: 4096 },
    );
    if (!raw || raw.trim() === '') throw new BadRequestException('AI 返回了空结果，请重试');

    const parsed = this.parseStructured(raw);
    const newSeg = parsed.segments?.[0];
    if (!newSeg) throw new BadRequestException('AI 未返回有效的片段，请重试');

    newSeg.segmentNo = Number(dto.segmentNo) || current?.segmentNo || 1;
    if (!newSeg.duration) newSeg.duration = current?.duration || 5;

    // 语言/资产兜底（与 analyze 一致）
    const merged: any = { episodes: [{ segments: [newSeg] }], assets: result.assets || {} };
    this.sanitizePrompts(merged);
    this.mergeUnknownAssetRefs(merged);

    const newAssets: any = {};
    for (const list of ['characters', 'props', 'scenes']) {
      const added = (merged.assets[list] || []).filter((a: any) =>
        !(result.assets?.[list] || []).some((x: any) => x.name === a.name));
      if (added.length) newAssets[list] = added;
    }
    if (!result.assets) result.assets = {};
    for (const list of ['characters', 'props', 'scenes']) {
      if (!result.assets[list]) result.assets[list] = [];
      result.assets[list] = merged.assets[list] || result.assets[list];
    }

    return { segment: newSeg, newAssets };
  }

  async getEpisodes(userId: number, projectId: number) {
    await this.getById(userId, projectId);
    return this.episodeRepo.find({
      where: { project_id: projectId },
      order: { episode_no: 'ASC' },
    });
  }

  async getEpisodeDetail(userId: number, episodeId: number) {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('分集不存在');
    const project = await this.projectRepo.findOne({ where: { id: episode.project_id, user_id: userId } });
    if (!project) throw new NotFoundException('短剧项目不存在');

    const segments = await this.segmentRepo.find({
      where: { episode_id: episodeId },
      order: { segment_no: 'ASC' },
    });
    return { episode, segments };
  }

  async updateEpisodeSettings(userId: number, episodeId: number, data: { style?: string; ratio?: string; resolution?: string; audio_lang?: string }) {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('分集不存在');
    const project = await this.projectRepo.findOne({ where: { id: episode.project_id, user_id: userId } });
    if (!project) throw new NotFoundException('短剧项目不存在');
    Object.assign(episode, data);
    return this.episodeRepo.save(episode);
  }

  async getAssets(userId: number, projectId: number) {
    await this.getById(userId, projectId);
    return this.assetRepo.find({ where: { project_id: projectId } });
  }

  async updateAsset(userId: number, assetId: number, data: Partial<DramaAsset>) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('资产不存在');
    await this.getById(userId, asset.project_id);
    Object.assign(asset, data);
    return this.assetRepo.save(asset);
  }

  async addAsset(userId: number, projectId: number, data: Partial<DramaAsset>) {
    await this.getById(userId, projectId);
    if (!data.type || !data.name) throw new BadRequestException('资产类型和名称不能为空');
    if (!['character', 'prop', 'scene'].includes(data.type!)) throw new BadRequestException('类型必须为 character/prop/scene');
    const existing = await this.assetRepo.findOne({
      where: { project_id: projectId, type: data.type, name: data.name },
    });
    if (existing) throw new BadRequestException('同类型同名资产已存在，不能重复添加');
    const asset = this.assetRepo.create({ project_id: projectId, ...data });
    return this.assetRepo.save(asset);
  }

  async removeAsset(userId: number, assetId: number) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('资产不存在');
    await this.getById(userId, asset.project_id);
    await this.assetRepo.remove(asset);
    return { deleted: true };
  }

  private async downloadToLocal(url: string, prefix: string): Promise<string> {
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!url.startsWith('http')) {
      if (url.startsWith('data:')) return url;
      // /static/ path → map into output dir (reject traversal)
      const staticMatch = url.match(/^\/static\/([^?]+)$/);
      if (staticMatch) {
        const local = path.resolve(outputDir, staticMatch[1]);
        if (local.startsWith(outputDir + path.sep) && fs.existsSync(local)) {
          return `/static/${staticMatch[1].replace(/\\/g, '/')}`;
        }
        return url;
      }
      // Absolute path → only reuse files that already live inside output dir
      const resolved = path.resolve(url);
      if (resolved.startsWith(outputDir + path.sep) && fs.existsSync(resolved)) {
        return `/static/${path.basename(resolved)}`;
      }
      return url;
    }
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = path.extname(url.split('?')[0]) || '.png';
    const filename = `${prefix}_${Date.now()}${ext}`;
    const localPath = path.join(outputDir, filename);
    try {
      await downloadToFile(url, localPath, { timeoutMs: 60000 });
      return `/static/${filename}`;
    } catch {
      return url;
    }
  }

  async generateAsset(userId: number, assetId: number, width?: number, height?: number, style?: string) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('资产不存在');
    const project = await this.getById(userId, asset.project_id);
    if (!asset.prompt) throw new BadRequestException('资产没有生成提示词，请先编辑');

    // Credit charge: 资产图生成 5 分/张（预扣，失败退全款）
    const assetCost = await this.credits.dramaAssetImageCost();
    await this.credits.assertEnough(userId, assetCost, '资产图生成');

    asset.status = 'generating';
    await this.assetRepo.save(asset);

    // Auto-compute dimensions from project target ratio if not explicitly provided
    let imgW = width;
    let imgH = height;
    if (!imgW || !imgH) {
      const ratio = project.target_ratio || '9:16';
      const [rw, rh] = ratio.split(':').map(Number);
      // Base size: 720px on the shorter side
      if (rw <= rh) {
        imgW = 720;
        imgH = Math.round(720 * rh / rw);
      } else {
        imgH = 720;
        imgW = Math.round(720 * rw / rh);
      }
      // Ensure even dimensions
      if (imgW % 2 !== 0) imgW++;
      if (imgH % 2 !== 0) imgH++;
      this.logger.log(`Asset ${asset.name} auto-sized to ${imgW}x${imgH} (project ratio ${ratio})`);
    }

    try {
      const urls = await this.aiService.generateImage({
        prompt: asset.prompt,
        style: style || 'anime',
        numImages: 1,
        width: imgW,
        height: imgH,
      });
      const url = await this.downloadToLocal(urls[0], `asset_${asset.id}`);
      if (asset.image_url && !asset.image_url.startsWith('http')) {
        const oldPath = path.join(process.cwd(), 'output', path.basename(asset.image_url));
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }
      asset.image_url = url;
      asset.status = 'completed';
      await this.assetRepo.save(asset);
      return { id: asset.id, image_url: url, status: 'completed' };
    } catch (err: any) {
      asset.status = 'failed';
      await this.assetRepo.save(asset);
      // 生成失败 → 退全款
      await this.credits.refund(userId, assetCost).catch(() => undefined);
      throw new BadRequestException(`资产生成失败: ${err.message}`);
    }
  }

  async planAssetPrompt(userId: number, assetId: number) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('资产不存在');
    await this.getById(userId, asset.project_id);

    const typeLabel: Record<string, string> = { character: '角色', prop: '道具', scene: '场景' };
    const typeCn = typeLabel[asset.type] || asset.type;

    const prompt = `你是一个AI绘画提示词优化专家。请优化下面这个${typeCn}资产的提示词，使其更适合用于AI图片生成。

资产名称：${asset.name}
资产类型：${typeCn}
资产描述：${asset.description || '无'}
当前提示词：${asset.prompt || '无'}
当前中文提示词：${asset.prompt_cn || '无'}

要求：
1. 优化英文 prompt，添加细节如光线、构图、质感、色彩等
2. 优化中文 prompt_cn，与英文 prompt 对应
3. 不要包含任何风格词（如 anime、realistic、动漫风格、写实风格等），风格由调用方另行控制
4. 注意人物角色需要描述外貌、服饰、表情、姿态
5. 场景需要描述环境、氛围、光线
6. 道具需要描述外观、材质、质感、光效

请严格按照以下 JSON 格式返回：
{
  "prompt": "优化后的英文提示词",
  "prompt_cn": "优化后的中文提示词"
}`;

    const raw = await this.aiService.chatCompletion([
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 2048 });

    if (!raw || raw.trim() === '') throw new BadRequestException('AI 优化失败');

    let result: { prompt: string; prompt_cn: string };
    try {
      const cleaned = raw.replace(/```(?:json)?\s*/gi, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { result = JSON.parse(match[0]); } catch { throw new BadRequestException(`AI 返回无法解析: ${raw.substring(0, 200)}`); }
      } else {
        throw new BadRequestException(`AI 返回无法解析: ${raw.substring(0, 200)}`);
      }
    }

    if (result.prompt) asset.prompt = result.prompt;
    if (result.prompt_cn) asset.prompt_cn = result.prompt_cn;
    await this.assetRepo.save(asset);

    return { prompt: asset.prompt, prompt_cn: asset.prompt_cn };
  }

  async translateAssetPrompt(userId: number, assetId: number, chineseText: string) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('资产不存在');
    await this.getById(userId, asset.project_id);

    const prompt = `你是一个翻译助手。请将以下中文提示词翻译成英文AI绘画提示词，只返回英文翻译结果，不要额外说明。\n\n${chineseText}`;
    const result = await this.aiService.chatCompletion([
      { role: 'user', content: prompt },
    ], { temperature: 0.3 });

    return { prompt: (result || '').trim() };
  }

  async generateAllAssets(userId: number, projectId: number) {
    await this.getById(userId, projectId);
    const assets = await this.assetRepo.find({
      where: { project_id: projectId, status: In(['pending', 'failed']) },
    });
    if (!assets.length) throw new BadRequestException('没有待生成的资产');

    const results: any[] = [];
    for (const asset of assets) {
      try {
        const result = await this.generateAsset(userId, asset.id);
        results.push(result);
      } catch (err: any) {
        results.push({ id: asset.id, status: 'failed', error: err.message });
      }
    }
    return results;
  }

  async uploadAssetImage(userId: number, assetId: number, imageUrl: string) {
    const asset = await this.assetRepo.findOne({ where: { id: assetId } });
    if (!asset) throw new NotFoundException('资产不存在');
    await this.getById(userId, asset.project_id);
    if (!imageUrl) throw new BadRequestException('图片 URL 不能为空');
    if (!/^(data:image\/|https?:\/\/|\/static\/)/.test(imageUrl)) {
      throw new BadRequestException('图片 URL 仅允许 data URI / http(s) 外链 / 本站静态路径');
    }

    if (asset.image_url) {
      const candidates = asset.candidates ? JSON.parse(asset.candidates) : [];
      candidates.push(asset.image_url);
      asset.candidates = JSON.stringify(candidates);
    }
    asset.image_url = imageUrl;
    asset.status = 'completed';
    await this.assetRepo.save(asset);
    return { id: asset.id, image_url: imageUrl, status: 'completed' };
  }

  async importFromGlobal(userId: number, projectId: number, assetIds: number[]) {
    await this.getById(userId, projectId);
    if (!assetIds || !assetIds.length) throw new BadRequestException('请选择要导入的资产');
    const globals = await this.globalAssetRepo.find({ where: { id: In(assetIds) } });
    if (!globals.length) throw new NotFoundException('未找到指定的大资产');

    const created: DramaAsset[] = [];
    for (const g of globals) {
      const existing = await this.assetRepo.findOne({
        where: { project_id: projectId, type: g.type, name: g.name },
      });
      if (existing) continue;
      const asset = this.assetRepo.create({
        project_id: projectId, type: g.type, name: g.name,
        description: g.description, prompt: g.prompt,
        prompt_cn: g.prompt_cn, image_url: g.image_url,
        status: g.image_url ? 'completed' : 'pending',
      });
      created.push(await this.assetRepo.save(asset));
      await this.globalAssetRepo.update(g.id, { usage_count: () => 'usage_count + 1' });
    }
    return created;
  }

  async updateSegment(userId: number, segmentId: number, data: Partial<DramaSegment>) {
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    Object.assign(segment, data);
    return this.segmentRepo.save(segment);
  }

  async getEpisodeSegments(userId: number, episodeId: number) {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    return this.segmentRepo.find({ where: { episode_id: episodeId }, order: { segment_no: 'ASC' } });
  }

  /** 片段候选列表（含质检标记），候选 0 无记录时返回空数组 */
  async listSegmentCandidates(userId: number, segmentId: number) {
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    const rows = await this.candidateRepo.find({ where: { segment_id: segmentId }, order: { candidate_index: 'ASC' } });
    const mainUrl = segment.video_url;
    return rows.map(r => ({
      id: r.id,
      candidate_index: r.candidate_index,
      video_url: r.video_url,
      status: r.status,
      quality: r.quality,
      quality_report: r.quality_report ? JSON.parse(r.quality_report) : null,
      is_accepted: !!r.is_accepted,
      is_main: !!r.video_url && !!mainUrl && r.video_url === mainUrl,
      error_msg: r.error_msg,
    }));
  }

  /** 采纳候选：置 is_accepted=true（其余候选取消采纳），回写 segment.video_url */
  async acceptSegmentCandidate(userId: number, candidateId: number) {
    const cand = await this.candidateRepo.findOne({ where: { id: candidateId } });
    if (!cand) throw new NotFoundException('候选不存在');
    const segment = await this.segmentRepo.findOne({ where: { id: cand.segment_id } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    if (!cand.video_url) throw new BadRequestException('该候选没有视频文件');

    await this.candidateRepo.update({ segment_id: cand.segment_id }, { is_accepted: false });
    cand.is_accepted = true;
    await this.candidateRepo.save(cand);

    segment.video_url = cand.video_url;
    await this.segmentRepo.save(segment);
    this.logger.log(`片段 ${cand.segment_id} 采纳候选 ${cand.id}（idx=${cand.candidate_index}）→ ${cand.video_url}`);
    return { accepted: true, video_url: cand.video_url };
  }

  /** 删除候选记录（文件保留，由 cleanup 兜底清理；已采纳候选禁止删除，防止主视频 404） */
  async deleteSegmentCandidate(userId: number, candidateId: number) {
    const cand = await this.candidateRepo.findOne({ where: { id: candidateId } });
    if (!cand) throw new NotFoundException('候选不存在');
    const segment = await this.segmentRepo.findOne({ where: { id: cand.segment_id } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    if (cand.is_accepted) throw new BadRequestException('已采纳的候选不能删除，请先采纳其他候选');
    await this.candidateRepo.delete({ id: candidateId });
    return { deleted: true };
  }

  /** 提交片段生成任务（candidateCount=候选数 1~3，默认 1） */
  async generateSegment(userId: number, segmentId: number, candidateCount = 1) {
    const count = Math.max(1, Math.min(3, Math.floor(candidateCount || 1)));
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    if (!segment.prompt) throw new BadRequestException('片段没有提示词，请先编辑');

    const job = await this.segmentQueue.add('generate', { userId, segmentId, candidateCount: count });
    return { jobId: job.id, segmentId, status: 'queued', candidateCount: count };
  }

  async getSegmentStatus(userId: number, segmentId: number) {
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    return {
      id: segment.id,
      status: segment.status,
      video_url: segment.video_url,
      progress_message: segment.progress_message,
      progress_percent: segment.progress_percent,
    };
  }

  private async updateSegmentProgress(segmentId: number, message: string, percent: number) {
    await this.segmentRepo.update(segmentId, { progress_message: message, progress_percent: percent });
  }

  /** 片段生成执行（队列 worker 调用）：candidateCount 个候选，逐个容错，全部失败才退款 */
  async executeSegmentGeneration(userId: number, segmentId: number, candidateCount = 1) {
    const count = Math.max(1, Math.min(3, Math.floor(candidateCount || 1)));
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    if (!segment.prompt) throw new BadRequestException('片段没有提示词，请先编辑');

    // Credit charge: 片段生成固定价（480p=120/720p=240/1080p=360）× 候选数（预扣，失败退全款）
    const segCost = await this.credits.dramaSegmentCost(episode.resolution);
    const totalCost = segCost * count;
    await this.credits.assertEnough(userId, totalCost, '片段生成');
    this.logger.log(`[credits] 片段 ${segmentId} 预扣 ${totalCost} 积分（候选数 ${count} × ${segCost}，分辨率 ${episode.resolution || '720p'}）`);

    segment.status = 'generating';
    await this.segmentRepo.save(segment);

    // 重新生成 = 推倒重来：清空该片段的全部旧候选行（防 N 变小后旧候选残留混淆；
    // 旧候选文件由 cleanup 引用保护+孤儿清理兜底）
    const oldMainVideo = segment.video_url;
    try {
      const oldRows = await this.candidateRepo.find({ where: { segment_id: segmentId } });
      if (oldRows.length > 0) {
        await this.candidateRepo.delete({ segment_id: segmentId });
        this.logger.log(`片段 ${segmentId} 清空 ${oldRows.length} 条旧候选记录，开始新一轮生成`);
      }
    } catch (cleanErr: any) {
      this.logger.warn(`清空旧候选失败（继续生成）: ${cleanErr.message}`);
    }

    const candidates: any[] = [];
    let sharedTts: { audioPath: string; ttsText: string } | null = null;
    let mainVideoUrl = '';
    let successCount = 0;

    try {
      for (let i = 0; i < count; i++) {
        try {
          const cand = await this.generateOneCandidate(segment, episode, i, count, sharedTts);
          if (cand && cand.video_url) {
            candidates.push({ candidate_index: i, video_url: cand.video_url, status: 'completed' });
            if (!mainVideoUrl) mainVideoUrl = cand.video_url;
            successCount++;
          } else {
            candidates.push({ candidate_index: i, status: 'failed' });
          }
          // 首个成功候选生成的 TTS 音频给后续候选复用（同文本同音色 → 音频相同）
          if (cand?.audio_path && !sharedTts) {
            sharedTts = { audioPath: cand.audio_path, ttsText: cand.tts_text || '' };
          }
        } catch (candErr: any) {
          this.logger.warn(`[候选] 片段 ${segmentId} 候选 ${i + 1}/${count} 生成失败: ${candErr.message}`);
          try {
            // 失败候选也走 find-or-update（重新生成时不得产生重复行）
            let row = await this.candidateRepo.findOne({ where: { segment_id: segmentId, candidate_index: i } });
            if (!row) row = this.candidateRepo.create({ segment_id: segmentId, candidate_index: i });
            row.status = 'failed';
            row.error_msg = (candErr.message || '').slice(0, 1000);
            await this.candidateRepo.save(row);
          } catch { /* ignore */ }
          candidates.push({ candidate_index: i, status: 'failed', error: candErr.message });
        }
      }

      if (successCount === 0) throw new Error('所有候选均生成失败');

      segment.video_url = mainVideoUrl;
      segment.progress_message = '视频已生成';
      segment.progress_percent = 100;
      segment.status = 'completed';
      await this.segmentRepo.save(segment);

      // 清理旧的片段主视频（非任何候选文件）
      if (oldMainVideo && oldMainVideo.startsWith('/static/')) {
        const isCandidateFile = candidates.some(c => c.video_url === oldMainVideo);
        if (!isCandidateFile) {
          const oldPath = path.join(process.cwd(), 'output', path.basename(oldMainVideo));
          try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch { /* ignore */ }
        }
      }

      return { id: segment.id, video_url: mainVideoUrl, status: 'completed', candidates };
    } catch (err: any) {
      segment.status = 'failed';
      await this.segmentRepo.save(segment);
      // 片段生成失败 → 退全款（含候选数倍扣费）
      await this.credits.refund(userId, totalCost).catch(() => undefined);
      this.logger.log(`[credits] 片段 ${segmentId} 生成失败，已退还 ${totalCost} 积分`);
      throw new BadRequestException(`片段生成失败: ${err.message}`);
    }
  }

  /**
   * 生成单个候选视频（含可选质检），结果写入 drama_segment_candidates 表。
   * 多候选时 TTS 音频复用（sharedTts：首个候选生成后缓存，后续候选直接复用）。
   */
  private async generateOneCandidate(
    segment: DramaSegment,
    episode: DramaEpisode,
    candidateIndex: number,
    candidateCount: number,
    sharedTts?: { audioPath: string; ttsText: string } | null,
  ): Promise<{ candidate_index: number; video_url: string; status: string; audio_path?: string; tts_text?: string }> {
    const label = `候选 ${candidateIndex + 1}/${candidateCount}`;
    const progress = (msg: string, pct: number) => this.updateSegmentProgress(segment.id, `[${label}] ${msg}`, pct);
    const epStyle = episode.style || 'anime';
    const epRatio = episode.ratio || '9:16';
    const epResolution = episode.resolution || '720p';
    const qualityCheckEnabled = await this.isQualityCheckEnabled();

    try {
      await progress('正在解析资产引用...', 5);

      // Parse asset references
      let charNames: string[] = JSON.parse(segment.character_refs || '[]');
      let propNames: string[] = JSON.parse(segment.prop_refs || '[]');
      let sceneNames: string[] = JSON.parse(segment.scene_refs || '[]');

      // Auto-detect from prompt when no explicit refs are set
      if (charNames.length === 0 && propNames.length === 0 && sceneNames.length === 0) {
        const allAssets = await this.assetRepo.find({ where: { project_id: episode.project_id }, select: ['name', 'type'] });
        const promptText = segment.prompt || '';
        charNames = allAssets.filter(a => a.type === 'character' && promptText.includes(a.name)).map(a => a.name);
        sceneNames = allAssets.filter(a => a.type === 'scene' && promptText.includes(a.name)).map(a => a.name);
        propNames = allAssets.filter(a => a.type === 'prop' && promptText.includes(a.name)).map(a => a.name);
        if (charNames.length || sceneNames.length || propNames.length) {
          this.logger.log(`Auto-detected from prompt — ${charNames.length} chars, ${sceneNames.length} scenes, ${propNames.length} props`);
        }
      }

      const allNames = [...charNames, ...propNames, ...sceneNames];

      // Find matching assets
      const assets = allNames.length
        ? await this.assetRepo.find({ where: { project_id: episode.project_id, name: In(allNames) } })
        : [];

      await progress('正在获取资产图片...', 15);

      // Auto-generate missing assets, collect media array
      const media: Array<{ type: string; url: string }> = [];
      const missingAssets: string[] = [];
      for (const name of [...sceneNames, ...charNames, ...propNames]) {
        let asset = assets.find(a => a.name === name);
        if (!asset) {
          missingAssets.push(name);
          this.logger.warn(`Asset not found in project: ${name} — will use name in prompt only`);
          continue;
        }

        if (!asset.image_url) {
          // Generate missing asset image on the fly
          const imgPrompt = asset.description
            ? `${asset.name}：${asset.description}`
            : `image of ${asset.name}`;
          try {
            this.logger.log(`Auto-generating missing asset image: ${asset.name}`);
            const [rw, rh] = epRatio.split(':').map(Number);
            const imgW = rw <= rh ? 720 : Math.round(720 * rw / rh);
            const imgH = rw <= rh ? Math.round(720 * rh / rw) : 720;
            const images = await this.aiService.generateImage({
              prompt: imgPrompt,
              width: imgW, height: imgH,
              numImages: 1,
              style: epStyle,
            });
            if (images.length > 0) {
              asset.image_url = await this.downloadToLocal(images[0], `asset_${asset.id}`);
              await this.assetRepo.save(asset);
              this.logger.log(`Asset image saved: ${asset.name} → ${asset.image_url}`);
            }
          } catch (imgErr: any) {
            this.logger.warn(`Asset image generation failed for ${asset.name}: ${imgErr.message}`);
          }
        }

        if (asset.image_url) {
          media.push({ type: 'reference_image', url: asset.image_url });
        }
      }

      if (missingAssets.length > 0) {
        this.logger.warn(`Missing assets (${missingAssets.length}): ${missingAssets.join(', ')} — using prompt-only mode for these`);
      }
      this.logger.log(`Media array ready: ${media.length} images from ${sceneNames.length + charNames.length + propNames.length} refs`);

      await progress('资产图片获取完成，正在构建提示词...', 25);

      // Build enhanced prompt with asset context
      const assetContext: string[] = [];
      for (const name of charNames) {
        const a = assets.find(ass => ass.name === name);
        if (a) {
          assetContext.push(`角色「${a.name}」：${a.description || ''}`);
        } else {
          assetContext.push(`角色「${name}」`);
        }
      }
      for (const name of sceneNames) {
        const a = assets.find(ass => ass.name === name);
        if (a) {
          assetContext.push(`场景「${a.name}」：${a.description || ''}`);
        } else {
          assetContext.push(`场景「${name}」`);
        }
      }
      for (const name of propNames) {
        const a = assets.find(ass => ass.name === name);
        if (a) {
          assetContext.push(`物品「${a.name}」：${a.description || ''}`);
        } else {
          assetContext.push(`物品「${name}」`);
        }
      }

      let enhancedPrompt = assetContext.length
        ? `${assetContext.join('；')}。情节：${segment.prompt}`
        : segment.prompt;
      if (segment.timeline) {
        enhancedPrompt += `\n\n时间轴：${segment.timeline}`;
      }

      // 调试日志：显示增强提示词和媒体信息
      this.logger.log(`[DEBUG] Segment ${segment.id} enhancedPrompt (first 300): ${enhancedPrompt.slice(0, 300)}`);
      this.logger.log(`[DEBUG] Segment ${segment.id} media count: ${media.length}, refs: chars=${charNames.length}(${charNames.join(',')}), scenes=${sceneNames.length}(${sceneNames.join(',')}), props=${propNames.length}(${propNames.join(',')})`);
      if (media.length > 0) {
        this.logger.log(`[DEBUG] Segment ${segment.id} first media url: ${media[0].url?.slice(0, 80)}...`);
      }

      await progress('正在获取可用模型...', 35);

      // Auto-select model: R2V for multi-image, I2V for single, T2V as fallback
      const vidOptions: any = {
        prompt: enhancedPrompt,
        duration: segment.duration || 5,
        resolution: epResolution,
        ratio: epRatio,
        style: epStyle,
      };
      if (media.length > 0) {
        vidOptions.media = media;
        // Don't force a specific model — let the priority chain in generateVideoWithTongyi
        // handle model selection based on media count and token availability
      }

      await progress('正在生成视频（调用AI模型）...', 45);
      const remoteUrl = await this.aiService.generateVideo(vidOptions, enhancedPrompt);

      await progress('视频生成成功，正在下载...', 70);
      let videoUrl = await this.downloadToLocal(remoteUrl, `seg_${segment.id}`);

      await progress('正在校正画面比例...', 73);
      // FFmpeg ratio correction as fallback — ensures output matches target ratio
      // even if the I2V model locks to the reference image aspect ratio
      try {
        const localVideoPath = videoUrl.startsWith('/static/')
          ? path.join(process.cwd(), 'output', path.basename(videoUrl))
          : videoUrl;
        const fittedPath = await this.ffmpeg.fitVideoToRatio(localVideoPath, epRatio);
        if (fittedPath !== localVideoPath) {
          const fittedBasename = path.basename(fittedPath);
          videoUrl = `/static/${fittedBasename}`;
          // Clean up original file
          try { fs.unlinkSync(localVideoPath); } catch { /* ignore */ }
          this.logger.log(`Segment ${segment.id} ratio corrected to ${epRatio}`);
        }
      } catch (ratioErr: any) {
        this.logger.warn(`Ratio correction failed for segment ${segment.id}: ${ratioErr.message} — using original`);
      }

      await progress('视频下载完成', 75);

      // TTS audio: if audio_lang is set, generate narration and merge (多候选共享音频)
      let audioPath = sharedTts?.audioPath || '';
      let ttsText = sharedTts?.ttsText || '';
      if (episode.audio_lang) {
        try {
          let audioLang = episode.audio_lang;
          // Legacy 'none' → zh
          if (audioLang === 'none') audioLang = 'zh';
          if (!sharedTts) {
            // Pick text matching the target language
            if (audioLang === 'zh' || audioLang === 'ja') {
              ttsText = segment.prompt_cn || segment.summary || segment.prompt || '';
            } else {
              ttsText = segment.prompt || segment.summary || segment.prompt_cn || '';
            }
          }
          if (ttsText) {
            await progress('正在生成配音...', 78);
            // Translate the narration into the selected language so the
            // spoken dialogue actually matches the chosen audio_lang
            if (!sharedTts && (audioLang === 'en' || audioLang === 'ja')) {
              try {
                const langName = audioLang === 'en' ? 'English' : 'Japanese';
                const translated = await this.aiService.chatCompletion([
                  { role: 'system', content: `You are a professional translator. Translate the dialogue below into ${langName}. Keep the tone natural for anime dubbing, keep character names and proper nouns as-is. Output ONLY the translated text, no quotes, no explanation.` },
                  { role: 'user', content: ttsText.slice(0, 400) },
                ], { temperature: 0.3, maxTokens: 600 });
                const cleaned = (translated || '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
                if (cleaned) {
                  this.logger.log(`Segment ${segment.id} TTS translated to ${audioLang}: ${cleaned.slice(0, 60)}...`);
                  ttsText = cleaned;
                }
              } catch (transErr: any) {
                this.logger.warn(`TTS translation to ${audioLang} failed (using source text): ${transErr.message}`);
              }
            }
            if (!audioPath || !fs.existsSync(audioPath)) {
              const voiceMap: Record<string, string> = { zh: 'nova', en: 'alloy', ja: 'nova' };
              const voice = voiceMap[audioLang] || 'alloy';
              const audioBuf = await this.aiService.generateTTS({
                text: ttsText.slice(0, 500),
                voice,
                speed: 1.0,
              });
              if (audioBuf && audioBuf.byteLength > 0) {
                audioPath = path.join(process.cwd(), 'output', `tts_${segment.id}_${Date.now()}.mp3`);
                fs.writeFileSync(audioPath, Buffer.from(audioBuf));
              }
            }
            if (audioPath && fs.existsSync(audioPath)) {
              await progress('配音生成完成，正在合成音视频...', 85);
              const mergedPath = await this.ffmpeg.compositeVideoWithAudio(
                videoUrl.startsWith('/static/')
                  ? path.join(process.cwd(), 'output', path.basename(videoUrl))
                  : videoUrl,
                audioPath,
                segment.duration || 5,
                path.join(process.cwd(), 'output', `seg_${segment.id}_audio_${Date.now()}.mp4`),
              );
              // Replace videoUrl with the audio-merged version
              const mergedBasename = path.basename(mergedPath);
              if (mergedBasename.startsWith('seg_')) {
                try {
                  fs.unlinkSync(videoUrl.startsWith('/static/')
                    ? path.join(process.cwd(), 'output', path.basename(videoUrl))
                    : videoUrl);
                } catch { /* ignore */ }
                const fullPath = path.isAbsolute(mergedPath) ? mergedPath : path.join(process.cwd(), 'output', mergedPath);
                if (fs.existsSync(fullPath)) {
                  videoUrl = `/static/${mergedBasename}`;
                }
              }
            }
          }
        } catch (ttsErr: any) {
          this.logger.warn(`TTS audio generation failed: ${ttsErr.message} — continuing without audio`);
        }
      }

      // 视觉质检（可配置开关 quality_check_enabled，失败不阻断生成）
      if (qualityCheckEnabled) {
        const finalPath = videoUrl.startsWith('/static/')
          ? path.join(process.cwd(), 'output', path.basename(videoUrl))
          : videoUrl;
        await this.saveCandidate(segment.id, candidateIndex, videoUrl, 'completed', null, null);
        await this.qualityCheckSegment(segment.id, candidateIndex, finalPath, media);
      } else {
        await this.saveCandidate(segment.id, candidateIndex, videoUrl, 'completed', null, null);
      }

      return { candidate_index: candidateIndex, video_url: videoUrl, status: 'completed', audio_path: audioPath || undefined, tts_text: ttsText || undefined };
    } catch (err) {
      throw err;
    }
  }

  /** 质检开关（system_configs.quality_check_enabled，未配置默认开启） */
  private async isQualityCheckEnabled(): Promise<boolean> {
    try {
      const v = await this.aiService.getConfig('quality_check_enabled');
      if (!v) return true;
      return v === '1' || v.toLowerCase() === 'true';
    } catch {
      return true;
    }
  }

  /** 片段质检：抽 3 帧 → qwen3-vl-flash → 结果写入候选表（失败标记 unknown，不阻断生成） */
  private async qualityCheckSegment(segmentId: number, candidateIndex: number, videoPath: string, media: Array<{ type: string; url: string }>) {
    try {
      const frames = await this.ffmpeg.extractFramesAt(videoPath, await this.pickCheckTimes(videoPath));
      if (frames.length === 0) {
        this.logger.warn(`[质检] 片段 ${segmentId} 候选 ${candidateIndex} 抽帧失败，标记 unknown`);
        await this.saveCandidate(segmentId, candidateIndex, null, 'completed', 'unknown', null);
        return;
      }
      const strictnessRaw = await this.aiService.getConfig('quality_check_strictness');
      const strictness = strictnessRaw === 'strict' || strictnessRaw === 'loose' ? strictnessRaw : 'normal';
      const refImage = media.length > 0 ? media[0].url : undefined;
      const result = await this.aiService.visualCheck(frames, { referenceImage: refImage, strictness: strictness as any });
      await this.saveCandidate(segmentId, candidateIndex, null, 'completed', result.pass, JSON.stringify({ issues: result.issues, consistency: result.consistency }));
      for (const f of frames) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
    } catch (qcErr: any) {
      this.logger.warn(`[质检] 片段 ${segmentId} 候选 ${candidateIndex} 质检异常（标记 unknown，不阻断）: ${qcErr.message}`);
      await this.saveCandidate(segmentId, candidateIndex, null, 'completed', 'unknown', null);
    }
  }

  /** 按视频时长均匀取质检抽帧时间点（≤6s 取 3 帧，更长取 10%/50%/90%） */
  private async pickCheckTimes(videoPath: string): Promise<number[]> {
    try {
      const info = await this.ffmpeg.getVideoInfo(videoPath);
      const dur = info.duration || 5;
      if (dur <= 3) return [1];
      if (dur <= 6) return [1, dur / 2, Math.max(dur - 1, 0.5)].map(t => Number(t.toFixed(2)));
      return [dur * 0.1, dur * 0.5, Math.max(dur * 0.9, dur - 1.5)].map(t => Number(t.toFixed(2)));
    } catch {
      return [1, 3, 5];
    }
  }

  /** 写候选表（存在则更新，不存在则新建；videoUrl/quality 为空不覆盖已有值） */
  private async saveCandidate(segmentId: number, candidateIndex: number, videoUrl: string | null, status: string, quality: string | null, qualityReport: string | null) {
    try {
      let row = await this.candidateRepo.findOne({ where: { segment_id: segmentId, candidate_index: candidateIndex } });
      if (!row) {
        row = this.candidateRepo.create({ segment_id: segmentId, candidate_index: candidateIndex });
      }
      row.status = status;
      if (videoUrl) row.video_url = videoUrl;
      if (quality) row.quality = quality;
      if (qualityReport) row.quality_report = qualityReport;
      await this.candidateRepo.save(row);
    } catch (err: any) {
      this.logger.warn(`[候选表] 写入失败 segment=${segmentId} idx=${candidateIndex}: ${err.message}`);
    }
  }


  async generateEpisodeSegments(userId: number, episodeId: number) {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    const segments = await this.segmentRepo.find({
      where: { episode_id: episodeId, status: In(['pending', 'failed']) },
      order: { segment_no: 'ASC' },
    });
    if (!segments.length) throw new BadRequestException('没有待生成的片段');

    const results: any[] = [];
    for (const seg of segments) {
      try {
        const result = await this.generateSegment(userId, seg.id);
        results.push(result);
      } catch (err: any) {
        results.push({ id: seg.id, status: 'failed', error: err.message });
      }
    }
    return results;
  }

  async planSegmentDuration(userId: number, segmentId: number) {
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);

    const chars = JSON.parse(segment.character_refs || '[]');
    const props = JSON.parse(segment.prop_refs || '[]');
    const scenes = JSON.parse(segment.scene_refs || '[]');

    const prompt = `你是一个短剧分镜规划专家。请分析下面这个片段的剧情内容，判断它需要多少秒的视频时长（3~15秒之间），并给出一个时间轴结构。

片段摘要：${segment.summary || '无'}
片段描述：${segment.prompt_cn || segment.prompt || '无'}
涉及角色：${chars.join(', ') || '无'}
涉及道具：${props.join(', ') || '无'}
涉及场景：${scenes.join(', ') || '无'}

请严格按照以下 JSON 格式返回（不要返回其他内容）：
{
  "duration": 数字,  // 3~15 之间的整数秒数
  "timeline": "时间轴描述，例如：1~3秒：角色A在城堡中行走；4~6秒：角色A遭遇敌人；7~8秒：角色A拔出宝剑战斗"
}`;

    const raw = await this.aiService.chatCompletion([
      { role: 'user', content: prompt },
    ], { temperature: 0.2, maxTokens: 2048 });

    if (!raw || raw.trim() === '') throw new BadRequestException('AI 规划失败，返回为空');

    let result: { duration: number; timeline: string };
    try {
      const cleaned = raw.replace(/```(?:json)?\s*/gi, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { result = JSON.parse(match[0]); } catch { throw new BadRequestException(`AI 返回无法解析: ${raw.substring(0, 200)}`); }
      } else {
        throw new BadRequestException(`AI 返回无法解析: ${raw.substring(0, 200)}`);
      }
    }

    const duration = Math.max(3, Math.min(15, Math.round(result.duration || 5)));
    const timeline = result.timeline || '';

    segment.duration = duration;
    if (timeline) {
      segment.timeline = timeline;
    }
    await this.segmentRepo.save(segment);

    return { duration, timeline };
  }

  async stitchEpisode(userId: number, episodeId: number) {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);

    const segments = await this.segmentRepo.find({
      where: { episode_id: episodeId, status: 'completed' },
      order: { segment_no: 'ASC' },
    });
    if (segments.length < 2) throw new BadRequestException('至少需要 2 个已完成片段才能合成');

    // Submit to queue and return immediately
    const job = await this.segmentQueue.add('stitch', { userId, episodeId });
    return { jobId: job.id, episodeId, status: 'queued' };
  }

  async executeStitch(userId: number, episodeId: number) {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('分集不存在');

    episode.stitch_status = 'stitching';
    await this.episodeRepo.save(episode);

    const segments = await this.segmentRepo.find({
      where: { episode_id: episodeId, status: 'completed' },
      order: { segment_no: 'ASC' },
    });

    const outputDir = path.resolve(process.cwd(), 'output');
    const clips: Array<{ path: string }> = [];

    try {
      const updateStitchProgress = async (message: string, percent: number) => {
        await this.episodeRepo.update(episodeId, { stitch_progress_message: message, stitch_progress_percent: percent });
      };

      await updateStitchProgress('正在收集片段视频...', 10);

      // Collect all segment video files (local paths or remote URLs)
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg.video_url) throw new BadRequestException(`片段 ${seg.segment_no} 没有视频文件`);

        let localPath = seg.video_url;
        // If it's a remote HTTP URL, download it first
        if (seg.video_url.startsWith('http://') || seg.video_url.startsWith('https://')) {
          await updateStitchProgress(`正在下载片段 ${i + 1}/${segments.length}...`, 15 + Math.round((i / segments.length) * 30));
          const ext = path.extname(new URL(seg.video_url).pathname) || '.mp4';
          const dlPath = path.join(outputDir, `tmp_${episodeId}_${seg.segment_no}_${Date.now()}${ext}`);
          const resp = await axios.get(seg.video_url, { responseType: 'stream', timeout: 60000 });
          const writer = fs.createWriteStream(dlPath);
          await new Promise<void>((resolve, reject) => {
            resp.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          localPath = dlPath;
        }

        // /static/ 是 URL 前缀，转回真实磁盘路径
        if (localPath.startsWith('/static/')) {
          localPath = path.join(outputDir, path.basename(localPath));
        }
        if (!fs.existsSync(localPath)) {
          this.logger.warn(`片段 ${seg.segment_no} 视频文件缺失，尝试重新生成`);
          await updateStitchProgress(`片段 ${seg.segment_no} 文件缺失，正在重新生成...`, 15 + Math.round((i / segments.length) * 30));
          try {
            const result = await this.executeSegmentGeneration(userId, seg.id);
            localPath = result.video_url;
            if (localPath.startsWith('/static/')) {
              localPath = path.join(outputDir, path.basename(localPath));
            }
            if (!fs.existsSync(localPath)) throw new Error('重新生成后文件仍不存在');
          } catch (regErr: any) {
            throw new Error(`片段 ${seg.segment_no} 视频文件不存在且重新生成失败: ${regErr.message}`);
          }
        }
        clips.push({ path: localPath });
      }

      await updateStitchProgress('片段下载完成，正在拼接视频...', 50);

      // Merge via FFmpeg
      const mergedPath = await this.ffmpeg.mergeVideos(clips);

      await updateStitchProgress('视频拼接成功，正在保存成片...', 80);

      // Save result to episode
      const filename = path.basename(mergedPath);
      const webUrl = `/static/${filename}`;
      episode.video_url = webUrl;
      episode.stitch_status = 'completed';
      episode.stitch_progress_message = '本集成片已完成';
      episode.stitch_progress_percent = 100;
      await this.episodeRepo.save(episode);

      return { id: episode.id, video_url: webUrl, status: 'completed' };
    } catch (err: any) {
      episode.stitch_status = 'failed';
      episode.stitch_progress_message = err.message;
      await this.episodeRepo.save(episode);
      throw new BadRequestException(`本集合成失败: ${err.message}`);
    } finally {
      await this.episodeRepo.update(episodeId, { stitch_progress_message: '正在清理临时文件...', stitch_progress_percent: 95 });
      // Clean up any downloaded temp files (not original segment videos)
      for (const clip of clips) {
        const p = clip.path;
        // Only delete temp downloads (tmp_ prefix), NOT original segment videos (seg_ prefix)
        if (p.startsWith(outputDir) && path.basename(p).startsWith('tmp_')) {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
        }
      }
    }
  }

  async getEpisodeStitchStatus(episodeId: number) {
    const episode = await this.episodeRepo.findOne({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('分集不存在');
    return {
      stitch_status: episode.stitch_status,
      stitch_progress_message: episode.stitch_progress_message,
      stitch_progress_percent: episode.stitch_progress_percent,
      video_url: episode.video_url,
    };
  }

  /** 字符串感知提取根 JSON 对象（跳过字符串内的大括号）；未闭合（被截断）时返回全部文本 */
  private extractRootObject(text: string): string {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(0, i + 1);
      } else if (ch === '[') depth++;
      else if (ch === ']') depth--;
    }
    return text;
  }

  /** 解析 LLM 结构化输出：直接解析失败时，尝试「截断渐进解析」——丢弃末尾不完整元素，保留前面完整数据 */
  private parseStructured(text: string): any {
    const raw = text.trim();
    const start = raw.indexOf('{');
    if (start === -1) {
      throw new Error(`响应中未找到 JSON 对象`);
    }
    const jsonText = this.extractRootObject(raw.slice(start));
    try {
      return JSON.parse(jsonText);
    } catch {
      /* 输出可能被 max_tokens 截断（JSON 不闭合），进入渐进兜底 */
    }

    // 正向扫描（跳过字符串内括号），收集所有「元素闭合点」
    const closePoints: number[] = [];
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < jsonText.length; i++) {
      const ch = jsonText[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        const top = stack[stack.length - 1];
        if ((ch === '}' && top === '{') || (ch === ']' && top === '[')) {
          stack.pop();
          closePoints.push(i);
          if (closePoints.length > 30) closePoints.shift();
        }
      }
    }

    // 从最近一个闭合点往前逐个尝试「截断 + 补全括号」解析（越接近截断点保留数据越多）
    for (let k = closePoints.length - 1; k >= 0; k--) {
      const slice = jsonText.slice(0, closePoints[k] + 1);
      try {
        const parsed = JSON.parse(this.repairTruncated(slice));
        this.logger.warn(`LLM 输出被截断，已渐进解析出部分数据（截断点前完整元素 ${closePoints.length} 个）`);
        return parsed;
      } catch { /* 试下一个候选 */ }
    }

    const lastBrace = jsonText.lastIndexOf('}');
    if (lastBrace > 0) {
      try {
        return JSON.parse(this.repairTruncated(jsonText.slice(0, lastBrace + 1)));
      } catch { /* fallthrough */ }
    }
    throw new Error('AI 返回内容无法解析为有效 JSON（已尝试截断渐进解析）');
  }

  /** 为被截断的 JSON 片段补全未闭合的引号与括号 */
  private repairTruncated(s: string): string {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') {
        const top = stack[stack.length - 1];
        if ((ch === '}' && top === '{') || (ch === ']' && top === '[')) stack.pop();
      }
    }
    let tail = '';
    if (inString) tail += '"';
    while (stack.length) {
      tail += stack.pop() === '{' ? '}' : ']';
    }
    return s + tail;
  }

  /** 两阶段分析兜底：片段引用了但 assets 未定义的资产 → 自动补入（LLM 违约防御） */
  private mergeUnknownAssetRefs(data: any) {
    if (!data.assets) data.assets = {};
    const lists: Array<'characters' | 'props' | 'scenes'> = ['characters', 'props', 'scenes'];
    for (const list of lists) {
      if (!data.assets[list]) data.assets[list] = [];
    }
    const defined = new Set<string>(lists.flatMap((l) => (data.assets[l] || []).map((a: any) => a.name)));
    for (const ep of data.episodes || []) {
      for (const seg of ep.segments || []) {
        for (const list of lists) {
          for (const name of seg[list] || []) {
            if (!defined.has(name)) {
              data.assets[list].push({ name, description: '', prompt: '', prompt_cn: '' });
              defined.add(name);
              this.logger.warn(`片段引用未定义资产「${name}」，已自动补入 assets`);
            }
          }
        }
      }
    }
  }

  /** 兜底：剥离 prompt 中的中文字符（模板约束失效时防止中文残留进 AI 视频生成提示词）；剥离后为空则回退 prompt_cn */
  private sanitizePrompts(data: any) {
    const clean = (s: string) => (s || '')
      .replace(/[\u4e00-\u9fff，。、；：！？（）「」《》【】“”‘’·…—、]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const sanitize = (o: any) => {
      if (typeof o?.prompt === 'string' && o.prompt.trim()) {
        const cleaned = clean(o.prompt);
        if (cleaned) o.prompt = cleaned;
        else if (typeof o.prompt_cn === 'string' && o.prompt_cn.trim()) o.prompt = o.prompt_cn.trim();
      }
    };
    for (const ep of data.episodes || []) {
      for (const seg of ep.segments || []) sanitize(seg);
    }
    for (const list of ['characters', 'props', 'scenes']) {
      for (const a of data.assets?.[list] || []) sanitize(a);
    }
  }

  private validateAnalysis(data: any) {
    if (!data.title) data.title = '未命名短剧';
    if (!data.genre) data.genre = '其他';
    if (!data.episodeCount || data.episodeCount < 1) data.episodeCount = 1;
    if (!data.episodes || !Array.isArray(data.episodes)) data.episodes = [];
    data.episodes.forEach((ep: any, i: number) => {
      if (!ep.episodeNo) ep.episodeNo = i + 1;
      if (!ep.title) ep.title = `第${ep.episodeNo}集`;
      if (!ep.segments || !Array.isArray(ep.segments)) ep.segments = [];
      if (!ep.duration) ep.duration = 60;
      ep.segments.forEach((seg: any) => {
        if (!seg.segmentNo) seg.segmentNo = 1;
        if (!seg.duration) seg.duration = 5;
      });
    });
    if (!data.assets) data.assets = {};
    if (!data.assets.characters) data.assets.characters = [];
    if (!data.assets.props) data.assets.props = [];
    if (!data.assets.scenes) data.assets.scenes = [];

    const allCharNames = data.assets.characters.map((c: any) => c.name);
    const allPropNames = data.assets.props.map((p: any) => p.name);
    const allSceneNames = data.assets.scenes.map((s: any) => s.name);

    for (const ep of data.episodes) {
      for (const seg of ep.segments) {
        if (seg.characters) {
          for (const ref of seg.characters) {
            if (!allCharNames.includes(ref)) {
              this.logger.warn(`Segment references unknown character: ${ref}`);
            }
          }
        }
        if (seg.props) {
          for (const ref of seg.props) {
            if (!allPropNames.includes(ref)) {
              this.logger.warn(`Segment references unknown prop: ${ref}`);
            }
          }
        }
        if (seg.scenes) {
          for (const ref of seg.scenes) {
            if (!allSceneNames.includes(ref)) {
              this.logger.warn(`Segment references unknown scene: ${ref}`);
            }
          }
        }
      }
    }
  }

  async getModelInfo() {
    return this.aiService.getModelDisplayInfo();
  }
}
