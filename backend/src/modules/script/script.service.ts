import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Script } from './script.entity';
import { VideoTask } from '../video/video.entity';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { PromptTemplateService } from '../admin/prompt-template.service';

export interface SceneItem {
  index: number;
  prompt: string;
  duration: number;
  status: string;
  video_url?: string;
  cover_url?: string;
  task_id?: number;
  error_msg?: string;
}

@Injectable()
export class ScriptService {
  constructor(
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
    private readonly aiService: AIServiceUtil,
    private readonly templateService: PromptTemplateService,
  ) {}

  async create(userId: number, dto: { title?: string; content: string; scenes?: any }) {
    const script = this.scriptRepo.create({ ...dto, user_id: userId });
    return this.scriptRepo.save(script);
  }

  async findByUser(userId: number) {
    return this.scriptRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      select: ['id', 'title', 'status', 'created_at'],
    });
  }

  async findOne(id: number, userId: number) {
    const script = await this.scriptRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!script) throw new NotFoundException('剧本不存在');
    return script;
  }

  async update(id: number, userId: number, dto: { title?: string; content?: string; scenes?: any; status?: string }) {
    const script = await this.findOne(id, userId);
    Object.assign(script, dto);
    return this.scriptRepo.save(script);
  }

  async remove(id: number, userId: number) {
    const script = await this.findOne(id, userId);
    await this.videoRepo.update({ script_id: id }, { script_id: null as any });
    return this.scriptRepo.remove(script);
  }

  async splitScenes(id: number, userId: number): Promise<SceneItem[]> {
    const script = await this.findOne(id, userId);
    const raw = script.content || '';
    if (!raw.trim()) throw new BadRequestException('剧本内容为空');

    // Try AI-powered splitting first
    try {
      const scenes = await this.splitWithAI(raw);
      if (scenes && scenes.length > 0) {
        script.scenes = scenes;
        script.status = 'processing';
        await this.scriptRepo.save(script);
        return scenes;
      }
    } catch (err) {
      // AI split failed, fall through to naive split
    }

    // Fallback: naive text splitting
    let parts: string[] = [];

    const markdownSep = raw.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
    if (markdownSep.length > 1) { parts = markdownSep; }

    if (parts.length === 0) {
      parts = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    }

    if (parts.length <= 1) {
      parts = [raw.trim()].filter(Boolean);
    }

    const scenes: SceneItem[] = parts.map((text, i) => ({
      index: i,
      prompt: text,
      duration: 5,
      status: 'pending',
    }));

    script.scenes = scenes;
    script.status = 'processing';
    await this.scriptRepo.save(script);
    return scenes;
  }

  private async splitWithAI(content: string): Promise<SceneItem[] | null> {
    const templates = await this.templateService.find(undefined, 'script');
    const splitTemplate = templates.find((t: any) => t.name === '剧本智能拆分模板');
    if (!splitTemplate) return null;

    const prompt = splitTemplate.template.replace('{{content}}', content);
    const rawResponse = await this.aiService.chatCompletion([
      { role: 'user', content: prompt },
    ], { temperature: 0.3 });

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.scenes || !Array.isArray(parsed.scenes)) return null;

    return parsed.scenes.map((s: any, i: number) => ({
      index: i,
      prompt: s.prompt || '',
      duration: s.duration || 5,
      status: 'pending' as const,
    }));
  }

  async updateScene(id: number, userId: number, index: number, dto: { prompt?: string; duration?: number }) {
    const script = await this.findOne(id, userId);
    if (!script.scenes || !Array.isArray(script.scenes)) {
      throw new BadRequestException('请先拆分场景');
    }
    const scene: SceneItem = script.scenes[index];
    if (!scene) throw new NotFoundException('场景不存在');
    if (dto.prompt !== undefined) scene.prompt = dto.prompt;
    if (dto.duration !== undefined) scene.duration = dto.duration;
    await this.scriptRepo.save(script);
    return scene;
  }

  async getCompletedSceneVideoIds(id: number, userId: number): Promise<number[]> {
    const script = await this.findOne(id, userId);
    if (!script.scenes || !Array.isArray(script.scenes)) return [];
    return script.scenes
      .filter(s => s.status === 'completed' && s.task_id)
      .map(s => s.task_id!);
  }

  static splitContent(content: string): string[] {
    const raw = content || '';
    let parts: string[] = [];
    const md = raw.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
    if (md.length > 1) { parts = md; }
    if (parts.length === 0) {
      parts = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    }
    if (parts.length <= 1) parts = [raw.trim()].filter(Boolean);
    return parts;
  }
}
