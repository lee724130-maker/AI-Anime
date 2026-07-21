import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { ModelConfigService } from '../admin/model-config.service';
import { MediaFile } from '../media/media-file.entity';
import { GenerationTask } from '../task/generation-task.entity';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly aiService: AIServiceUtil,
    private readonly modelConfigService: ModelConfigService,
    @InjectRepository(MediaFile)
    private readonly mediaRepo: Repository<MediaFile>,
    @InjectRepository(GenerationTask)
    private readonly taskRepo: Repository<GenerationTask>,
  ) {}

  async textToImage(userId: number, dto: {
    prompt: string;
    style?: string;
    num_images?: number;
    model?: string;
    width?: number;
    height?: number;
  }) {
    const { prompt, style, num_images, model } = dto;
    if (!prompt) throw new BadRequestException('请输入描述');

    let modelName = model || '';
    if (model) {
      const models = await this.modelConfigService.findActive('image');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'image',
      status: 'processing',
      model_name: modelName,
      input_data: JSON.stringify(dto),
    });

    try {
      const urls = await this.aiService.generateImage({
        prompt,
        style: style || 'anime',
        numImages: num_images || 1,
        width: dto.width || 1080,
        height: dto.height || 1920,
        model: model || undefined,
      });

      const results: any[] = [];
      for (const url of urls) {
        const localUrl = await this.downloadToLocal(url, `img_${task.id}`);
        const file = await this.mediaRepo.save({
          user_id: userId,
          task_id: task.id,
          type: 'image',
          url: localUrl,
          original_name: path.basename(localUrl),
          mime_type: 'image/png',
        });
        results.push({ id: file.id, url: localUrl });
      }

      task.status = 'completed';
      task.output_data = JSON.stringify(results);
      task.completed_at = new Date();
      await this.taskRepo.save(task);

      return { taskId: task.id, images: results };
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      await this.taskRepo.save(task);
      throw new BadRequestException(`图片生成失败: ${err.message}`);
    }
  }

  async textToVideo(userId: number, dto: {
    prompt: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
  }) {
    const { prompt, style, resolution, ratio, duration, model } = dto;
    if (!prompt) throw new BadRequestException('请输入描述');

    let modelName = model || '';
    if (model) {
      const models = await this.modelConfigService.findActive('video');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'video',
      status: 'processing',
      model_name: modelName,
      input_data: JSON.stringify(dto),
    });

    try {
      const videoUrl = await this.aiService.generateVideo({
        imageUrl: '',
        prompt,
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '9:16',
        model: model || '',
      }, prompt);

      const localUrl = await this.downloadToLocal(videoUrl, `vid_${task.id}`);
      const file = await this.mediaRepo.save({
        user_id: userId,
        task_id: task.id,
        type: 'video',
        url: localUrl,
        original_name: path.basename(localUrl),
        mime_type: 'video/mp4',
      });

      task.status = 'completed';
      task.output_data = JSON.stringify({ id: file.id, url: localUrl });
      task.completed_at = new Date();
      await this.taskRepo.save(task);

      return { taskId: task.id, video: { id: file.id, url: localUrl } };
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      await this.taskRepo.save(task);
      throw new BadRequestException(`视频生成失败: ${err.message}`);
    }
  }

  async imageToVideo(userId: number, dto: {
    image_url: string;
    prompt?: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
  }) {
    const { image_url, prompt, style, resolution, ratio, duration, model } = dto;
    if (!image_url) throw new BadRequestException('请提供参考图片');

    let modelName = model || '';
    if (model) {
      const models = await this.modelConfigService.findActive('video');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'video',
      source: 'image_to_video',
      status: 'processing',
      model_name: modelName,
      input_data: JSON.stringify(dto),
    });

    try {
      const videoUrl = await this.aiService.generateVideo({
        imageUrl: image_url,
        prompt: prompt || '',
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '9:16',
        model: model || '',
      }, prompt);

      const localUrl = await this.downloadToLocal(videoUrl, `i2v_${task.id}`);
      const file = await this.mediaRepo.save({
        user_id: userId,
        task_id: task.id,
        type: 'video',
        url: localUrl,
        original_name: path.basename(localUrl),
        mime_type: 'video/mp4',
      });

      task.status = 'completed';
      task.output_data = JSON.stringify({ id: file.id, url: localUrl });
      task.completed_at = new Date();
      await this.taskRepo.save(task);

      return { taskId: task.id, video: { id: file.id, url: localUrl } };
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      await this.taskRepo.save(task);
      throw new BadRequestException(`视频生成失败: ${err.message}`);
    }
  }

  async listTasks(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.taskRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async retryTask(userId: number, taskId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId, user_id: userId } });
    if (!task) throw new BadRequestException('任务不存在');
    if (task.status !== 'failed') throw new BadRequestException('只能重试失败的任务');

    const input = JSON.parse(task.input_data || '{}');
    task.status = 'pending';
    task.error_msg = '';
    task.completed_at = undefined as any;
    await this.taskRepo.save(task);

    if (task.type === 'image') {
      return this.textToImage(userId, input);
    }
    if (task.type === 'video') {
      if (input.image_url) {
        return this.imageToVideo(userId, input);
      }
      return this.textToVideo(userId, input);
    }
    throw new BadRequestException('不支持的任务类型');
  }

  private async downloadToLocal(url: string, prefix: string): Promise<string> {
    if (!url.startsWith('http')) return url;
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = path.extname(url.split('?')[0]) || '.mp4';
    const filename = `${prefix}_${Date.now()}${ext}`;
    const localPath = path.join(outputDir, filename);
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      fs.writeFileSync(localPath, Buffer.from(response.data));
      this.logger.log(`Downloaded to local: ${filename}`);
      return `/static/${filename}`;
    } catch (err: any) {
      this.logger.warn(`Download failed, using original URL: ${err.message}`);
      return url;
    }
  }
}
