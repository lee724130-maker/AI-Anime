import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Character } from './character.entity';
import { AIServiceUtil } from '../../utils/ai-service.util';

@Injectable()
export class CharacterService {
  constructor(
    @InjectRepository(Character)
    private readonly charRepo: Repository<Character>,
    private readonly aiService: AIServiceUtil,
  ) {}

  async create(userId: number, dto: { name: string; description?: string; avatar_url?: string; reference_image_anime?: string; reference_image_realistic?: string }) {
    const character = this.charRepo.create({ ...dto, user_id: userId });
    return this.charRepo.save(character);
  }

  async findByUser(userId: number) {
    return this.charRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number, userId: number) {
    const character = await this.charRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!character) throw new NotFoundException('角色不存在');
    return character;
  }

  async update(id: number, userId: number, dto: { name?: string; description?: string; avatar_url?: string; reference_image_anime?: string; reference_image_realistic?: string; lora_model_id?: string }) {
    const character = await this.findOne(id, userId);
    Object.assign(character, dto);
    return this.charRepo.save(character);
  }

  async remove(id: number, userId: number) {
    const character = await this.findOne(id, userId);
    return this.charRepo.remove(character);
  }

  private async downloadToLocal(url: string, charId: number, style: string): Promise<string> {
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = '.jpg';
    const filename = `ref_${charId}_${style}${ext}`;
    const localPath = path.join(outputDir, filename);
    if (fs.existsSync(localPath)) return `/static/${filename}`;
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(localPath, Buffer.from(response.data));
      return `/static/${filename}`;
    } catch {
      return url;
    }
  }

  async generateReferenceImage(id: number, userId: number, style: 'anime' | 'realistic') {
    if (style !== 'anime' && style !== 'realistic') {
      throw new BadRequestException('style 必须为 anime 或 realistic');
    }

    const character = await this.findOne(id, userId);
    const prompt = character.description
      ? `Character ${character.name}: ${character.description}, full body, front view, high quality`
      : `character: ${character.name}, full body, front view, high quality`;

    const images = await this.aiService.generateImage({
      prompt,
      width: 720,
      height: 1280,
      numImages: 1,
      style,
    });

    if (images.length === 0) {
      throw new Error(`AI 生成角色参考图失败（${style}）`);
    }

    const localUrl = await this.downloadToLocal(images[0], id, style);
    const field = style === 'anime' ? 'reference_image_anime' : 'reference_image_realistic';
    (character as any)[field] = localUrl;
    return this.charRepo.save(character);
  }
}
