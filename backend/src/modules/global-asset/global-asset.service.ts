import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { GlobalAsset } from './global-asset.entity';
import { AIServiceUtil } from '../../utils/ai-service.util';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class GlobalAssetService {
  private readonly logger = new Logger(GlobalAssetService.name);

  constructor(
    @InjectRepository(GlobalAsset)
    private readonly assetRepo: Repository<GlobalAsset>,
    private readonly aiService: AIServiceUtil,
  ) {}

  async list(query: {
    type?: string; tag?: string; keyword?: string;
    page?: number; limit?: number;
  }) {
    const { type, tag, keyword, page = 1, limit = 20 } = query;
    const where: any = {};
    if (type) where.type = type;
    if (tag) where.tags = Like(`%${tag}%`);
    if (keyword) {
      where.name = Like(`%${keyword}%`);
    }
    const [items, total] = await this.assetRepo.findAndCount({
      where,
      order: { updated_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(id: number) {
    const asset = await this.assetRepo.findOne({ where: { id } });
    if (!asset) throw new NotFoundException('大资产不存在');
    return asset;
  }

  async create(data: Partial<GlobalAsset>) {
    if (!data.type || !data.name) throw new BadRequestException('类型和名称不能为空');
    if (!['character', 'prop', 'scene'].includes(data.type!))
      throw new BadRequestException('类型必须为 character/prop/scene');
    const asset = this.assetRepo.create(data);
    return this.assetRepo.save(asset);
  }

  async update(id: number, data: Partial<GlobalAsset>) {
    const asset = await this.getById(id);
    Object.assign(asset, data);
    return this.assetRepo.save(asset);
  }

  async remove(id: number) {
    const asset = await this.getById(id);
    await this.assetRepo.remove(asset);
    return { deleted: true };
  }

  private async downloadToLocal(url: string, prefix: string): Promise<string> {
    if (!url.startsWith('http')) return url;
    const outputDir = path.resolve(process.cwd(), 'output');
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

  async generateImage(id: number, width?: number, height?: number, style?: string) {
    const asset = await this.getById(id);
    if (!asset.prompt) throw new BadRequestException('资产没有生成提示词');

    asset.status = 'generating';
    await this.assetRepo.save(asset);

    try {
      const urls = await this.aiService.generateImage({
        prompt: asset.prompt,
        style: style || (asset.type === 'character' ? 'anime' : undefined),
        numImages: 1,
        width,
        height,
      });
      if (!urls || urls.length === 0 || !urls[0]) {
        throw new BadRequestException('AI 生成未返回任何图片');
      }
      const url = await this.downloadToLocal(urls[0], `gasset_${asset.id}`);
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

  async translatePrompt(id: number, chineseText: string) {
    const asset = await this.getById(id);
    const prompt = `你是一个翻译助手。请将以下中文提示词翻译成英文AI绘画提示词，只返回英文翻译结果，不要额外说明。\n\n${chineseText}`;
    const result = await this.aiService.chatCompletion([
      { role: 'user', content: prompt },
    ], { temperature: 0.3 });
    return { prompt: (result || '').trim() };
  }

  async planPrompt(id: number) {
    const asset = await this.getById(id);
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

  async stats() {
    const [characters, props, scenes] = await Promise.all([
      this.assetRepo.count({ where: { type: 'character' } }),
      this.assetRepo.count({ where: { type: 'prop' } }),
      this.assetRepo.count({ where: { type: 'scene' } }),
    ]);
    const totalUsage = await this.assetRepo
      .createQueryBuilder('a')
      .select('SUM(a.usage_count)', 'total')
      .getRawOne();
    return {
      characters, props, scenes,
      total: characters + props + scenes,
      totalUsage: Number(totalUsage?.total || 0),
    };
  }

  async getDistinctTags(): Promise<string[]> {
    const assets = await this.assetRepo.find({ select: ['tags'] });
    const tagSet = new Set<string>();
    for (const a of assets) {
      if (a.tags) {
        a.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
      }
    }
    return Array.from(tagSet).sort();
  }
}
