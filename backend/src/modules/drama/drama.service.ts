import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { DramaProject } from './drama-project.entity';
import { DramaOutline } from './drama-outline.entity';
import { DramaEpisode } from './drama-episode.entity';
import { DramaSegment } from './drama-segment.entity';
import { DramaAsset } from './drama-asset.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { PromptTemplateService } from '../admin/prompt-template.service';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { FFmpegUtil } from '../../utils/ffmpeg.util';
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
    @InjectRepository(GlobalAsset)
    private readonly globalAssetRepo: Repository<GlobalAsset>,
    private readonly aiService: AIServiceUtil,
    private readonly templateService: PromptTemplateService,
    private readonly ffmpeg: FFmpegUtil,
    @InjectQueue('drama-segment')
    private readonly segmentQueue: Queue,
  ) {}

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

  async create(userId: number, data: Partial<DramaProject>) {
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

    const prompt = analyzeTemplate.template.replace('{{outline}}', project.outline);

    let outline = await this.outlineRepo.findOne({ where: { project_id: projectId } });
    if (!outline) {
      outline = this.outlineRepo.create({ project_id: projectId, outline: project.outline, status: 'analyzing' });
    } else {
      outline.outline = project.outline;
      outline.status = 'analyzing';
    }
    await this.outlineRepo.save(outline);

    try {
      const rawResponse = await this.aiService.chatCompletion([
        { role: 'user', content: prompt },
      ], { temperature: 0.3, maxTokens: 8192 });

      if (!rawResponse || rawResponse.trim() === '') {
        throw new Error('LLM 返回了空结果，请检查 API Key 是否已配置且可用');
      }

      outline.raw_response = rawResponse;

      const cleaned = this.cleanJson(rawResponse);
      const parsed = JSON.parse(cleaned);
      this.validateAnalysis(parsed);

      outline.structured_result = JSON.stringify(parsed);
      outline.status = 'completed';
      await this.outlineRepo.save(outline);

      project.status = 'analysis_done';
      await this.projectRepo.save(project);

      return parsed;
    } catch (err: any) {
      outline.status = 'failed';
      if (outline.raw_response) {
        this.logger.error(`Analysis raw response: ${outline.raw_response.substring(0, 500)}`);
      }
      await this.outlineRepo.save(outline);
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
      // Already a local path: if it's in outputDir, convert to /static/ relative path
      const basename = path.basename(url);
      const localPath = path.join(outputDir, basename);
      if (fs.existsSync(localPath)) return `/static/${basename}`;
      // File doesn't exist in output dir — try copying it there
      try {
        if (fs.existsSync(url)) {
          const ext = path.extname(url) || '.mp4';
          const filename = `${prefix}_${Date.now()}${ext}`;
          fs.copyFileSync(url, path.join(outputDir, filename));
          return `/static/${filename}`;
        }
      } catch { /* ignore */ }
      return url;
    }
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = path.extname(url.split('?')[0]) || '.png';
    const filename = `${prefix}_${Date.now()}${ext}`;
    const localPath = path.join(outputDir, filename);
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(localPath, Buffer.from(response.data));
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

  async generateSegment(userId: number, segmentId: number) {
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    if (!segment.prompt) throw new BadRequestException('片段没有提示词，请先编辑');

    const job = await this.segmentQueue.add('generate', { userId, segmentId });
    return { jobId: job.id, segmentId, status: 'queued' };
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

  async executeSegmentGeneration(userId: number, segmentId: number) {
    const segment = await this.segmentRepo.findOne({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException('片段不存在');
    const episode = await this.episodeRepo.findOne({ where: { id: segment.episode_id } });
    if (!episode) throw new NotFoundException('分集不存在');
    await this.getById(userId, episode.project_id);
    if (!segment.prompt) throw new BadRequestException('片段没有提示词，请先编辑');

    const epStyle = episode.style || 'anime';
    const epRatio = episode.ratio || '9:16';
    const epResolution = episode.resolution || '720p';

    segment.status = 'generating';
    await this.segmentRepo.save(segment);

    try {
      await this.updateSegmentProgress(segment.id, '正在解析资产引用...', 5);

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

      await this.updateSegmentProgress(segment.id, '正在获取资产图片...', 15);

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

      await this.updateSegmentProgress(segment.id, '资产图片获取完成，正在构建提示词...', 25);

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

      await this.updateSegmentProgress(segment.id, '正在获取可用模型...', 35);

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

      await this.updateSegmentProgress(segment.id, '正在生成视频（调用AI模型）...', 45);
      const remoteUrl = await this.aiService.generateVideo(vidOptions, enhancedPrompt);

      await this.updateSegmentProgress(segment.id, '视频生成成功，正在下载...', 70);
      let videoUrl = await this.downloadToLocal(remoteUrl, `seg_${segment.id}`);

      await this.updateSegmentProgress(segment.id, '正在校正画面比例...', 73);
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

      await this.updateSegmentProgress(segment.id, '视频下载完成', 75);

      // TTS audio: if audio_lang is set, generate narration and merge
      if (episode.audio_lang) {
        try {
          // Pick text matching the target language
          let audioLang = episode.audio_lang;
          // Legacy 'none' → zh
          if (audioLang === 'none') audioLang = 'zh';
          let ttsText = '';
          if (audioLang === 'zh' || audioLang === 'ja') {
            ttsText = segment.prompt_cn || segment.summary || segment.prompt || '';
          } else {
            ttsText = segment.prompt || segment.summary || segment.prompt_cn || '';
          }
          if (ttsText) {
            await this.updateSegmentProgress(segment.id, '正在生成配音...', 78);
            const voiceMap: Record<string, string> = { zh: 'nova', en: 'alloy', ja: 'nova' };
            const voice = voiceMap[audioLang] || 'alloy';
            const audioBuf = await this.aiService.generateTTS({
              text: ttsText.slice(0, 500),
              voice,
              speed: 1.0,
            });
            if (audioBuf && audioBuf.byteLength > 0) {
              const audioPath = path.join(process.cwd(), 'output', `tts_${segment.id}_${Date.now()}.mp3`);
              fs.writeFileSync(audioPath, Buffer.from(audioBuf));
              await this.updateSegmentProgress(segment.id, '配音生成完成，正在合成音视频...', 85);
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
                await this.updateSegmentProgress(segment.id, '正在清理旧文件...', 90);
                fs.unlinkSync(videoUrl.startsWith('/static/')
                  ? path.join(process.cwd(), 'output', path.basename(videoUrl))
                  : videoUrl);
                try { fs.unlinkSync(audioPath); } catch { /* ignore */ }
                const fullPath = path.isAbsolute(mergedPath) ? mergedPath : path.join(process.cwd(), 'output', mergedPath);
                if (fs.existsSync(fullPath)) {
                  segment.video_url = `/static/${mergedBasename}`;
                  segment.progress_message = '视频已生成';
                  segment.progress_percent = 100;
                  segment.status = 'completed';
                  await this.segmentRepo.save(segment);
                  return { id: segment.id, video_url: segment.video_url, status: 'completed' };
                }
              }
            }
          }
        } catch (ttsErr: any) {
          this.logger.warn(`TTS audio generation failed: ${ttsErr.message} — continuing without audio`);
        }
      }

      // Only delete old file after new one is successfully downloaded
      if (segment.video_url && segment.video_url.startsWith('/static/')) {
        await this.updateSegmentProgress(segment.id, '正在清理旧文件...', 90);
        const oldPath = path.join(process.cwd(), 'output', path.basename(segment.video_url));
        try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch { /* ignore */ }
      }

      segment.video_url = videoUrl;
      segment.progress_message = '视频已生成';
      segment.progress_percent = 100;
      segment.status = 'completed';
      await this.segmentRepo.save(segment);
      return { id: segment.id, video_url: videoUrl, status: 'completed', progress_message: '视频已生成', progress_percent: 100 };
    } catch (err: any) {
      segment.status = 'failed';
      await this.segmentRepo.save(segment);
      throw new BadRequestException(`片段生成失败: ${err.message}`);
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

  private cleanJson(text: string): string {
    let cleaned = text.trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleaned = cleaned.slice(start, end + 1);
    }
    if (!cleaned.startsWith('{')) {
      throw new Error(`响应中未找到 JSON 对象`);
    }
    return cleaned;
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
