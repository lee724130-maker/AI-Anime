import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectEntityManager } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { FFmpegUtil } from '../../utils/ffmpeg.util';
import { ModelConfigService } from '../admin/model-config.service';
import { downloadToFile } from '../../common/utils/safe-download.util';
import { MediaFile } from '../media/media-file.entity';
import { GenerationTask } from '../task/generation-task.entity';
import { User } from '../user/user.entity';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
const execFileAsync = promisify(execFile);

@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  /** 后台生成任务并发上限（system_configs: max_concurrent_generations 可配置），超出部分排队等待 */
  private maxConcurrent = 3;
  private active = 0;
  private pending: Array<() => void> = [];

  constructor(
    private readonly aiService: AIServiceUtil,
    private readonly ffmpeg: FFmpegUtil,
    private readonly modelConfigService: ModelConfigService,
    @InjectRepository(MediaFile)
    private readonly mediaRepo: Repository<MediaFile>,
    @InjectRepository(GenerationTask)
    private readonly taskRepo: Repository<GenerationTask>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {
    this.getConfigInt('max_concurrent_generations', 3).then((n) => {
      if (n >= 1 && n <= 20) this.maxConcurrent = n;
      this.logger.log(`[gen-queue] 并发上限 = ${this.maxConcurrent}`);
    }).catch(() => undefined);
  }

  /** 任务入队：超过并发上限的排队等待，空闲时自动调度 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job = () => {
        this.active++;
        this.logger.log(`[gen-queue] 开始执行 active=${this.active} pending=${this.pending.length}`);
        fn().then(resolve, reject).finally(() => {
          this.active--;
          this.drain();
        });
      };
      this.pending.push(job);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.maxConcurrent && this.pending.length > 0) {
      const job = this.pending.shift()!;
      job();
    }
  }

  /** 更新任务进度（单调递增 + 内存对象与 DB 同步，避免 save 覆盖旧值） */
  private async updateProgress(task: any, progress: number) {
    if (progress <= (task.progress || 0)) return;
    task.progress = progress;
    await this.taskRepo.update(task.id, { progress });
  }

  /** 估算生成积分成本（system_configs 可配置） */
  private async getConfigInt(key: string, def: number): Promise<number> {
    try {
      const rows: any = await this.entityManager.query(
        'SELECT config_value FROM system_configs WHERE config_key = ? LIMIT 1', [key],
      );
      const val = rows?.[0]?.config_value ?? rows?.config_value;
      const n = Number(val);
      return Number.isFinite(n) && n > 0 ? n : def;
    } catch {
      return def;
    }
  }

  /** 图：5 分/张；视频：480p=10/720p=20/1080p=40 × ceil(时长/5) */
  private async estimateCreditCost(dto: any): Promise<number> {
    if (dto.type === 'image') {
      const per = await this.getConfigInt('credit_cost_image', 5);
      return per * (dto.num_images || 1);
    }
    const res = dto.resolution || '720p';
    const defaults: Record<string, number> = { '480p': 10, '720p': 20, '1080p': 40 };
    const base = await this.getConfigInt(`credit_cost_${res}`, defaults[res] ?? 20);
    const mult = Math.max(1, Math.ceil(Number(dto.duration || 5) / 5));
    return base * mult;
  }

  /** 原子预扣积分，余额不足返回 false */
  private async chargeCredits(userId: number, cost: number): Promise<boolean> {
    if (cost <= 0) return true;
    const r: any = await this.entityManager.query(
      'UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?',
      [cost, userId, cost],
    );
    const affected = r?.affectedRows ?? r?.[0]?.affectedRows ?? 0;
    return affected > 0;
  }

  private async refundCredits(userId: number, cost: number): Promise<void> {
    if (cost <= 0) return;
    await this.entityManager.query(
      'UPDATE users SET credits = credits + ? WHERE id = ?',
      [cost, userId],
    );
  }

  /** 积分扣费规则（供前端展示，读 system_configs 实时值） */
  async getCreditRules(): Promise<Record<string, any>> {
    const [image, r480, r720, r1080] = await Promise.all([
      this.getConfigInt('credit_cost_image', 5),
      this.getConfigInt('credit_cost_480p', 10),
      this.getConfigInt('credit_cost_720p', 20),
      this.getConfigInt('credit_cost_1080p', 40),
    ]);
    return {
      image_per_image: image,
      video_480p_per_5s: r480,
      video_720p_per_5s: r720,
      video_1080p_per_5s: r1080,
      video_unit_seconds: 5,
      refund_on_failure: true,
    };
  }

  async textToImage(userId: number, dto: {
    prompt: string;
    style?: string;
    num_images?: number;
    model?: string;
    width?: number;
    height?: number;
  }) {
    const { prompt, model } = dto;
    if (!prompt) throw new BadRequestException('请输入描述');

    let modelName = '';
    if (model) {
      const models = await this.modelConfigService.findActive('image');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const creditCost = await this.estimateCreditCost({ type: 'image', num_images: dto.num_images });
    const charged = await this.chargeCredits(userId, creditCost);
    if (!charged) {
      throw new BadRequestException(`积分不足，本次生成需要 ${creditCost} 积分，请稍后再试`);
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'image',
      status: 'processing',
      model_name: modelName,
      credit_cost: creditCost,
      input_data: JSON.stringify(dto),
    });

    void this.enqueue(() => this.runTextToImage(userId, task.id, dto)).catch((err: any) => {
      this.logger.error(`[后台] 文生图任务 ${task.id} 异常: ${err.message}`);
    });

    return { taskId: task.id, status: 'processing' };
  }

  private async runTextToImage(userId: number, taskId: number, dto: {
    prompt: string;
    style?: string;
    num_images?: number;
    model?: string;
    width?: number;
    height?: number;
  }) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) return;
    const { prompt, style, num_images } = dto;
    let expandedPrompt = prompt;
    await this.updateProgress(task, 10);

    if (prompt.length < 15) {
      await this.updateProgress(task, 15);
      try {
        const systemPrompt = `你是一个AI绘图Prompt扩写专家，对各类动漫、游戏、小说角色了如指掌。

用户会输入简短的关键词（如角色名、作品名等），你需要：

1. 调用你的知识库，补全角色的完整视觉特征：
   - 外貌：发色、发型、瞳色、肤色、脸型、体型
   - 服装：上衣、下装、外套、鞋子、饰品、武器/道具
   - 气质：冷酷、温柔、英气、可爱等

2. 补充场景和构图：
   - 背景环境、光影氛围
   - 视角（全身/半身/特写）、构图
   - 画风（日系动画风、厚涂、赛璐璐、写实等）

3. 输出一段50-150字的纯描述文本，直接用作文生图模型的提示词

4. 规则：
   - 如果确定角色设定，按准确设定描述
   - 如果不确定某些细节，用合理且美观的创作填补，不要写"不确定"
   - 直接输出描述，不要任何解释、前缀、引号`;
        const expanded = await this.aiService.chatCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请扩写以下关键词，生成详细的视觉描述：${prompt}` },
        ], { temperature: 0.7, maxTokens: 500 });
        if (expanded && expanded.length > prompt.length) {
          expandedPrompt = expanded;
          this.logger.log(`Prompt auto-expanded: "${prompt}" → "${expanded.slice(0, 100)}..."`);
        }
      } catch (err: any) {
        this.logger.warn(`Prompt expansion failed, using original: ${err.message}`);
      }
    }

    const viewConfigs: Array<{ label: string; promptSuffix: string }> = [];
    const count = num_images || 1;
    if (count === 1) {
      viewConfigs.push({ label: '正面', promptSuffix: '' });
    } else if (count === 2) {
      viewConfigs.push({ label: '正面', promptSuffix: ', front view, character facing camera, full body' });
      viewConfigs.push({ label: '背面', promptSuffix: ', back view, character facing away, showing full back' });
    } else if (count === 4) {
      viewConfigs.push({ label: '正面', promptSuffix: ', front view, character facing camera, full body' });
      viewConfigs.push({ label: '背面', promptSuffix: ', back view, character facing away, showing full back' });
      viewConfigs.push({ label: '左侧', promptSuffix: ', left side view, character facing left, full body profile' });
      viewConfigs.push({ label: '右侧', promptSuffix: ', right side view, character facing right, full body profile' });
    }

    try {
      const results: any[] = [];
      const total = viewConfigs.length;
      for (let vi = 0; vi < total; vi++) {
        const view = viewConfigs[vi];
        const viewPrompt = expandedPrompt + view.promptSuffix;
        await this.updateProgress(task, 20 + Math.round((vi / total) * 60));
        const urls = await this.aiService.generateImage({
          prompt: viewPrompt,
          style: style || 'realistic',
          numImages: 1,
          width: dto.width || 1080,
          height: dto.height || 1920,
          model: dto.model || undefined,
        });
        for (const url of urls) {
          const localUrl = await this.downloadToLocal(url, `img_${task.id}_${view.label}`);
          const file = await this.mediaRepo.save({
            user_id: userId,
            task_id: task.id,
            type: 'image',
            url: localUrl,
            original_name: path.basename(localUrl),
            mime_type: 'image/png',
          });
          results.push({ id: file.id, url: localUrl, view: view.label });
        }
        await this.updateProgress(task, 20 + Math.round(((vi + 1) / total) * 60));
      }

      task.status = 'completed';
      task.output_data = JSON.stringify(results);
      task.credits_charged = true;
      task.completed_at = new Date();
      await this.updateProgress(task, 100);
      await this.taskRepo.save(task);
      this.logger.log(`任务 ${task.id} 文生图完成`);
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      if (task.credit_cost > 0 && !task.credits_charged) {
        await this.refundCredits(task.user_id, task.credit_cost);
        task.credits_charged = true;
      }
      await this.taskRepo.save(task);
      this.logger.warn(`任务 ${task.id} 文生图失败，已${task.credit_cost > 0 ? '退款' : '处理'}: ${err.message}`);
    }
  }

  async textToVideo(userId: number, dto: {
    prompt: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
    voiceover?: boolean;
    voiceover_text?: string;
  }) {
    const { prompt, model } = dto;
    if (!prompt) throw new BadRequestException('请输入描述');

    let modelName = '';
    if (model) {
      const models = await this.modelConfigService.findActive('video', 't2v');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const creditCost = await this.estimateCreditCost({ type: 'video', resolution: dto.resolution, duration: dto.duration });
    const charged = await this.chargeCredits(userId, creditCost);
    if (!charged) {
      throw new BadRequestException(`积分不足，本次生成需要 ${creditCost} 积分，请稍后再试`);
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'video',
      status: 'processing',
      model_name: modelName,
      credit_cost: creditCost,
      input_data: JSON.stringify(dto),
    });

    void this.enqueue(() => this.runTextToVideo(userId, task.id, dto)).catch((err: any) => {
      this.logger.error(`[后台] 文生视频任务 ${task.id} 异常: ${err.message}`);
    });

    return { taskId: task.id, status: 'processing' };
  }

  private async runTextToVideo(userId: number, taskId: number, dto: {
    prompt: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
    voiceover?: boolean;
    voiceover_text?: string;
  }) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) return;
    const { prompt, style, resolution, ratio, duration, model } = dto;
    await this.updateProgress(task, 10);

    try {
      await this.updateProgress(task, 20);
      const videoUrl = await this.aiService.generateVideo({
        imageUrl: '',
        prompt,
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '9:16',
        model: model || '',
        videoType: 't2v',
        style,
      }, prompt, (p) => {
        void this.updateProgress(task, Math.min(85, Math.max(30, p)));
      });

      let localUrl = await this.downloadToLocal(videoUrl, `vid_${task.id}`);
      await this.updateProgress(task, 92);

      // Voiceover: TTS narration merged into the generated video
      if (dto.voiceover) {
        try {
          const ttsText = (dto.voiceover_text || prompt || '').slice(0, 500);
          if (ttsText) {
            const voice = /[\u4e00-\u9fa5]/.test(ttsText) ? 'nova' : 'alloy';
            const audioBuf = await this.aiService.generateTTS({ text: ttsText, voice, speed: 1.0 });
            if (audioBuf && audioBuf.byteLength > 0) {
              const outputDir = path.resolve(process.cwd(), 'output');
              const ttsPath = path.join(outputDir, `tts_${task.id}_${Date.now()}.mp3`);
              fs.writeFileSync(ttsPath, Buffer.from(audioBuf));
              const localAbs = localUrl.startsWith('/static/')
                ? path.join(outputDir, path.basename(localUrl))
                : localUrl;
              const voicedPath = await this.ffmpeg.compositeVideoWithAudio(
                localAbs, ttsPath, duration || 5,
                path.join(outputDir, `vid_${task.id}_voiced_${Date.now()}.mp4`),
              );
              if (voicedPath && fs.existsSync(voicedPath)) {
                localUrl = `/static/${path.basename(voicedPath)}`;
                this.logger.log(`任务 ${task.id} 文生视频配音完成`);
              }
            }
          }
        } catch (voErr: any) {
          this.logger.warn(`任务 ${task.id} 配音失败，保留无声版本: ${voErr.message}`);
        }
      }

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
      task.credits_charged = true;
      task.completed_at = new Date();
      await this.updateProgress(task, 100);
      await this.taskRepo.save(task);
      this.logger.log(`任务 ${task.id} 文生视频完成`);
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      if (task.credit_cost > 0 && !task.credits_charged) {
        await this.refundCredits(task.user_id, task.credit_cost);
        task.credits_charged = true;
      }
      await this.taskRepo.save(task);
      this.logger.warn(`任务 ${task.id} 文生视频失败，已${task.credit_cost > 0 ? '退款' : '处理'}: ${err.message}`);
    }
  }

  async imageToVideo(userId: number, dto: {
    image_url: string;
    media?: Array<{ type: string; url: string }>;
    prompt?: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
    voiceover?: boolean;
    voiceover_text?: string;
  }) {
    const { image_url, media, model } = dto;
    if (!image_url && (!media || media.length === 0)) throw new BadRequestException('请提供参考图片');

    let modelName = '';
    if (model) {
      const models = await this.modelConfigService.findActive('video', 'i2v');
      const match = models.find((m: any) => m.model_id === model);
      if (!match) throw new BadRequestException(`模型 ${model} 不存在或未启用`);
      modelName = match.model_name;
    }

    const creditCost = await this.estimateCreditCost({ type: 'video', resolution: dto.resolution, duration: dto.duration });
    const charged = await this.chargeCredits(userId, creditCost);
    if (!charged) {
      throw new BadRequestException(`积分不足，本次生成需要 ${creditCost} 积分，请稍后再试`);
    }

    const task = await this.taskRepo.save({
      user_id: userId,
      type: 'video',
      source: 'image_to_video',
      status: 'processing',
      model_name: modelName,
      credit_cost: creditCost,
      input_data: JSON.stringify(dto),
    });

    void this.enqueue(() => this.runImageToVideo(userId, task.id, dto)).catch((err: any) => {
      this.logger.error(`[后台] 图生视频任务 ${task.id} 异常: ${err.message}`);
    });

    return { taskId: task.id, status: 'processing' };
  }

  private async runImageToVideo(userId: number, taskId: number, dto: {
    image_url: string;
    media?: Array<{ type: string; url: string }>;
    prompt?: string;
    style?: string;
    resolution?: string;
    ratio?: string;
    duration?: number;
    model?: string;
    voiceover?: boolean;
    voiceover_text?: string;
  }) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) return;
    const { image_url, media, prompt, style, resolution, ratio, duration, model } = dto;
    await this.updateProgress(task, 10);

    try {
      // 自动判断使用 I2V 还是 R2V
      const videoType = media && media.length > 1 ? 'r2v' : 'i2v';
      await this.updateProgress(task, 20);
      const videoUrl = await this.aiService.generateVideo({
        imageUrl: image_url,
        media: media,
        prompt: prompt || '',
        duration: duration || 5,
        resolution: resolution || '720p',
        ratio: ratio || '9:16',
        model: model || '',
        videoType,
        style,
      }, prompt, (p) => {
        void this.updateProgress(task, Math.min(85, Math.max(30, p)));
      });

      let localUrl = await this.downloadToLocal(videoUrl, `i2v_${task.id}`);
      await this.updateProgress(task, 92);

      // Voiceover: TTS narration merged into the generated video
      if (dto.voiceover) {
        try {
          const ttsText = (dto.voiceover_text || prompt || '').slice(0, 500);
          if (ttsText) {
            const voice = /[\u4e00-\u9fa5]/.test(ttsText) ? 'nova' : 'alloy';
            const audioBuf = await this.aiService.generateTTS({ text: ttsText, voice, speed: 1.0 });
            if (audioBuf && audioBuf.byteLength > 0) {
              const outputDir = path.resolve(process.cwd(), 'output');
              const ttsPath = path.join(outputDir, `tts_${task.id}_${Date.now()}.mp3`);
              fs.writeFileSync(ttsPath, Buffer.from(audioBuf));
              const localAbs = localUrl.startsWith('/static/')
                ? path.join(outputDir, path.basename(localUrl))
                : localUrl;
              const voicedPath = await this.ffmpeg.compositeVideoWithAudio(
                localAbs, ttsPath, duration || 5,
                path.join(outputDir, `i2v_${task.id}_voiced_${Date.now()}.mp4`),
              );
              if (voicedPath && fs.existsSync(voicedPath)) {
                localUrl = `/static/${path.basename(voicedPath)}`;
                this.logger.log(`任务 ${task.id} 图生视频配音完成`);
              }
            }
          }
        } catch (voErr: any) {
          this.logger.warn(`任务 ${task.id} 配音失败，保留无声版本: ${voErr.message}`);
        }
      }

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
      task.credits_charged = true;
      task.completed_at = new Date();
      await this.updateProgress(task, 100);
      await this.taskRepo.save(task);
      this.logger.log(`任务 ${task.id} 图生视频完成`);
    } catch (err: any) {
      task.status = 'failed';
      task.error_msg = err.message;
      task.completed_at = new Date();
      if (task.credit_cost > 0 && !task.credits_charged) {
        await this.refundCredits(task.user_id, task.credit_cost);
        task.credits_charged = true;
      }
      await this.taskRepo.save(task);
      this.logger.warn(`任务 ${task.id} 图生视频失败，已${task.credit_cost > 0 ? '退款' : '处理'}: ${err.message}`);
    }
  }

  async listTasks(userId: number, page = 1, limit = 20, type = '', status = '') {
    const where: any = { user_id: userId };
    if (type) where.type = type;
    if (status) where.status = status;
    const [items, total] = await this.taskRepo.findAndCount({
      where,
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
    task.progress = 0;
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

  async smartDescribe(userId: number, dto: { images: string[] }) {
    const { images } = dto;
    if (!images || images.length === 0) {
      throw new BadRequestException('请提供至少一张图片');
    }
    if (images.length > 9) {
      throw new BadRequestException('最多支持9张图片');
    }

    try {
      const description = await this.aiService.generateSmartDescription(images);
      return { description };
    } catch (err: any) {
      throw new BadRequestException(`智能描述生成失败: ${err.message}`);
    }
  }

  // ─── 百度百科搜索 ──────────────────────────────────
  private async searchBaike(keyword: string): Promise<string | null> {
    try {
      const name = keyword.replace(/角色|人物|鸣潮|原神|崩坏|星穹铁道/gi, '').trim() || keyword;
      const nameClean = encodeURIComponent(name);
      const urls = [
        `https://baike.baidu.com/item/${nameClean}`,
        `https://baike.baidu.com/view/${nameClean}`,
      ];
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://baike.baidu.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      };

      // 方案1: axios 直接请求
      let text = '';
      for (const url of urls) {
        this.logger.log(`[百度百科] axios 尝试: ${url}`);
        try {
          const resp = await axios.get(url, { timeout: 8000, headers });
          if (resp.status !== 200) continue;
          const html: string = resp.data;
          const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
          if (metaMatch) text += metaMatch[1] + ' ';
          const paraRegex = /<div\s+class="para"[^>]*>([\s\S]*?)<\/div>/gi;
          let m; let c = 0;
          while ((m = paraRegex.exec(html)) !== null && c < 5) {
            const clean = m[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').trim();
            if (clean.length > 20) { text += clean + ' '; c++; }
          }
          text = text.replace(/\s+/g, ' ').trim();
          if (text.length >= 30) break;
          text = '';
        } catch { continue; }
      }

      // 方案2: axios 失败，降级 Playwright 无头浏览器
      if (text.length < 30) {
        this.logger.log(`[百度百科] axios 失败，降级 Playwright 无头浏览器: ${name}`);
        try {
          const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'baike-fetcher.js');
          const { stdout } = await execFileAsync('node', [scriptPath, name], { timeout: 30000 });
          const out = stdout.trim();
          if (out.length >= 30) {
            text = out;
            this.logger.log(`[百度百科] Playwright 获取到 ${text.length} 字`);
          }
        } catch (e: any) {
          this.logger.warn(`[百度百科] Playwright 也失败: ${e.message}`);
        }
      }

      if (text.length < 30) {
        this.logger.warn(`[百度百科] 内容太少(${text.length}字)，跳过`);
        return null;
      }
      this.logger.log(`[百度百科] 获取到 ${text.length} 字: ${text.slice(0, 100)}...`);
      return text;
    } catch (err: any) {
      this.logger.warn(`[百度百科] 搜索失败: ${err.message}`);
      return null;
    }
  }

  // ─── T2I 策略：文字→图片 ─────────────────────────────
  private styleInstruction(style?: string): string {
    return style === 'anime'
      ? '用户当前选择【动漫风格】：描述必须采用日系动画/二次元插画质感（赛璐璐、厚涂、线稿均可），可自由使用动漫风格词汇。'
      : '用户当前选择【写实风格】：描述必须采用写实真人实拍、摄影质感，人物/场景/物品按真实世界材质与光影描述；严禁出现动漫、二次元、插画、厚涂、线稿、立绘、卡通、赛璐璐、日系动画等动漫风格词汇，画面中的角色一律是真实人物。';
  }

  private async handleT2i(prompt: string, images?: string[], style?: string) {
    this.logger.log(`[T2I] 文字→图片智能规划: "${prompt}"`);

    let imageDescription = '';
    if (images && images.length > 0) {
      try { imageDescription = await this.aiService.generateSmartDescription(images); }
      catch (err) { this.logger.warn(`[T2I] 图片分析失败: ${err.message}`); }
    }

    // 第一步：尝试百度百科获取真实资料
    const baikeData = await this.searchBaike(prompt);
    let referenceText = '';
    if (baikeData) {
      referenceText = `以下是从百度百科获取的角色资料（真实来源，优先采用）：\n${baikeData}`;
      if (imageDescription) referenceText += `\n\n以下是从用户提供的图片中提取的内容：\n${imageDescription}`;
    } else if (imageDescription) {
      referenceText = `以下是从用户提供的图片中提取的内容：\n${imageDescription}`;
    }

    if (referenceText) {
      // 有真实资料，直接基于资料生成 prompt
      const buildPrompt = `你是一个AI绘图Prompt构建专家。

用户提供了角色的真实资料（来自百度百科或参考图片）。你需要基于这些资料，生成一段高质量的文生图模型提示词。

${this.styleInstruction(style)}

要求：
1. 必须严格基于提供的资料描述角色，不要额外编造
2. 如果资料信息不足，用泛化描述填补（如"身着某风格服装"），不要编造具体细节
3. 补全构图信息：视角（全身/半身/特写）、光线风格
4. 输出150-300字，直接作为文生图提示词
5. 不要解释、不要引号、不要前缀`;

      return await this.aiService.chatCompletion([
        { role: 'system', content: buildPrompt },
        { role: 'user', content: `${referenceText}\n\n用户关键词：${prompt}\n\n请基于以上资料，生成一段文生图提示词。` }
      ], { temperature: 0.5, maxTokens: 1500 });
    }

    // 第二步：没有百科资料，用 LLM 知识分析
    const analysisPrompt = `${this.styleInstruction(style)}

你是一个角色描述分析专家。用户输入一个角色名或关键词，你需要：

1. 先回忆你对这个角色/主体的所有认知（来自训练数据）
2. 逐项列出以下细节，并用【确定】/【推测】标注你的确信度：

【外貌】发色、发型、瞳色、肤色、脸型、身高体型、特殊特征
【服装】上衣款式及颜色、下装、鞋履、首饰、武器/道具
【气质】表情、神态、常见姿态、标志性动作
【场景】常见的背景设定、光影氛围

格式要求：
- 【确定】表示你有明确的训练数据依据
- 【推测】表示你的合理推断
- 最后用一句话总结你最确定的5个核心特征`;

    const analysisResult = await this.aiService.chatCompletion([
      { role: 'system', content: analysisPrompt },
      { role: 'user', content: `请分析角色：${prompt}\n\n基于你的训练数据，逐项标注确定和推测的细节。` }
    ], { temperature: 0.3, maxTokens: 1000 });

    this.logger.log(`[T2I] LLM分析结果: ${analysisResult?.slice(0, 200)}...`);

    // 第三步：基于分析结果生成 prompt
    const buildPrompt = `你是一个AI绘图Prompt构建专家。

你会收到一份角色分析报告，其中标注了【确定】和【推测】的细节。

${this.styleInstruction(style)}

构建规则：
1. 【确定】的细节原样保留，优先放在前面
2. 【推测】的细节用更泛化的描述（如"深色系服装"而非具体颜色）
3. 不确定的细节不要编造具体数字/颜色/名称
4. 补全构图信息：视角、光线风格
5. 输出150-300字，直接作为文生图提示词
6. 不要标注【确定】/【推测】标记，不要解释、不要引号、不要前缀`;

    return await this.aiService.chatCompletion([
      { role: 'system', content: buildPrompt },
      { role: 'user', content: `角色分析报告：\n${analysisResult}\n\n请基于以上分析，生成一段高质量文生图提示词。` }
    ], { temperature: 0.5, maxTokens: 1500 });
  }

  // ─── T2V 策略：文字→视频 ─────────────────────────────
  private async handleT2v(prompt: string, images?: string[], style?: string) {
    this.logger.log(`[T2V] 文字→视频智能规划: "${prompt}"`);

    let imageDescription = '';
    if (images && images.length > 0) {
      try { imageDescription = await this.aiService.generateSmartDescription(images); }
      catch (err) { this.logger.warn(`[T2V] 图片分析失败: ${err.message}`); }
    }

    const systemPrompt = `你是一个AI视频分镜创意专家。

用户输入一段创意描述，你将其扩展成适合视频生成的动态场景描述。

${this.styleInstruction(style)}

请包含以下要素：
1. 场景设定：时间、地点、环境氛围（如黄昏街道、晨雾森林）
2. 角色动态：出场方式、动作流程、表情变化（至少2个关键帧变化）
3. 镜头语言：景别（远景/中景/特写）、运镜方式（推/拉/摇/移/环绕）
4. 光线氛围：光线变化、色调、特效（雨/雪/光晕/粒子）

规则：
- 突出"动态"——这要用于生成视频，不是静态图片
- 保持用户核心理念不变
- 100-200字
- 如果提供了图片分析结果，必须结合图片内容`;

    return await this.aiService.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: imageDescription
        ? `图片内容分析：${imageDescription}\n\n用户创意：${prompt}\n\n请结合图片内容和用户创意，生成一段详细的视频分镜描述。`
        : `用户创意：${prompt}\n\n请将这个简短的创意扩展成一段详细的视频分镜描述，包含场景、角色动态、镜头运动等。` }
    ], { temperature: 0.7, maxTokens: 1500 });
  }

  // ─── I2V 策略：图片→视频 ─────────────────────────────
  private async handleI2v(prompt: string, images?: string[], style?: string) {
    this.logger.log(`[I2V] 图片→视频智能规划: "${prompt}"`);

    if (!images || images.length === 0) {
      this.logger.warn('[I2V] 没有参考图片，降级为T2V');
      return this.handleT2v(prompt, images, style);
    }

    let imageDescription = '';
    try { imageDescription = await this.aiService.generateSmartDescription(images); }
    catch (err: any) { this.logger.warn(`[I2V] 图片分析失败: ${err.message}`); }

    if (!imageDescription) {
      this.logger.warn('[I2V] 图片分析无结果，降级为T2V');
      return this.handleT2v(prompt, images, style);
    }

    const systemPrompt = `你是一个AI视频动作指导专家。用户提供了参考图片的分析结果和一段文字描述。

你需要基于图片分析结果，规划一段连贯的视频动作描述，让图片内容"动起来"。

${this.styleInstruction(style)}

请包含以下要素：
1. 画面主体：保持与参考图一致的角色位置、姿态、表情
2. 动作设计：以细微动作为主（转头、眨眼、呼吸起伏、衣摆飘动、发丝飘动）
3. 镜头调度：缓慢推近、环绕、平移（避免剧烈运动）
4. 氛围延续：保持参考图的光影、色调、环境一致性

规则：
- 必须保持角色形象和场景与参考图一致
- 动作要自然流畅，避免剧烈变化
- 如果用户有文字描述，结合描述规划具体动作
- 100-200字`;

    return await this.aiService.chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `图片内容分析：${imageDescription}\n\n用户描述：${prompt}\n\n请结合图片内容，规划一段自然的视频动作描述。` }
    ], { temperature: 0.7, maxTokens: 1500 });
  }

  // ─── 智能规划主入口：三路分发 ─────────────────────────
  async smartPlan(userId: number, dto: { prompt: string; images?: string[]; mode?: string; style?: string }) {
    const { prompt, images, style } = dto;
    const mode = dto.mode || 't2i';
    if (!prompt || prompt.trim().length < 2) {
      throw new BadRequestException('请提供至少2个字的描述');
    }

    try {
      let enhancedPrompt: string | undefined;
      let voiceover: string | undefined;

      switch (mode) {
        case 't2i':
          enhancedPrompt = await this.handleT2i(prompt, images, style);
          break;
        case 't2v':
          enhancedPrompt = await this.handleT2v(prompt, images, style);
          voiceover = await this.buildVoiceover(prompt, enhancedPrompt || prompt).catch(() => undefined);
          break;
        case 'i2v':
          enhancedPrompt = await this.handleI2v(prompt, images, style);
          voiceover = await this.buildVoiceover(prompt, enhancedPrompt || prompt).catch(() => undefined);
          break;
        default:
          enhancedPrompt = await this.handleT2i(prompt, images, style);
      }

      return {
        prompt: enhancedPrompt || prompt,
        voiceover,
        original_prompt: prompt,
        mode,
      };
    } catch (err: any) {
      this.logger.error(`[${mode}] 智能规划失败: ${err.message}`);
      return { prompt, original_prompt: prompt, mode };
    }
  }

  /**
   * Generate a Chinese voiceover narration matching the planned video description,
   * so the AI 配音 has proper content without the user writing it by hand.
   */
  private async buildVoiceover(creativePrompt: string, finalPrompt: string): Promise<string> {
    const sys = `你是一个短视频解说词编剧，负责为AI配音写台词。用户会给你「画面描述」，你要写一段与之对应的话外音解说词。

要求（必须全部满足）：
1. 严格对照画面描述，画面里出现的主体、场景、动作、细节（如"橘猫""天台""黄昏""油漆桶"）都要在台词里提到，不得写画面里不存在的内容
2. 用短视频口播解说词的结构：开场点题（一句话抓住观众）→ 主体介绍 → 细节展开 → 情绪或行动收尾
3. 语气口语化、有节奏感，可用短句、问句制造张力
4. 禁止写成散文或纯景物描写，必须是有内容的"解说词/台词"（像抖音解说、广告旁白）
5. 80-150字，纯中文，不要引号、不要"旁白：""解说："等前缀、不要任何解释`;

    const result = await this.aiService.chatCompletion([
      { role: 'system', content: sys },
      { role: 'user', content: `画面描述：\n${finalPrompt}` },
    ], { temperature: 0.7, maxTokens: 500 });

    return (result || '').trim();
  }

  async deleteTask(userId: number, taskId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId, user_id: userId } });
    if (!task) throw new BadRequestException('任务不存在');

    const outputDir = path.resolve(process.cwd(), 'output');

    const deleteFiles = (data: any) => {
      if (!data) return;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return; }
      }
      const urls: string[] = [];
      if (Array.isArray(data)) {
        data.forEach((item: any) => { if (item.url) urls.push(item.url); });
      } else if (data.url) {
        urls.push(data.url);
      } else if (data.video?.url) {
        urls.push(data.video.url);
      } else if (data.images) {
        data.images.forEach((img: any) => { if (img.url) urls.push(img.url); });
      }
      for (const url of urls) {
        if (url.startsWith('/static/')) {
          const filePath = path.join(outputDir, path.basename(url));
          try { if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); this.logger.log(`Deleted file: ${path.basename(url)}`); } }
          catch (e: any) { this.logger.warn(`Failed to delete file ${url}: ${e.message}`); }
        }
      }
    };

    deleteFiles(task.output_data);

    await this.entityManager.query('DELETE FROM task_events WHERE task_id = ?', [taskId]);

    await this.mediaRepo.delete({ task_id: taskId });

    await this.taskRepo.delete({ id: taskId, user_id: userId });

    this.logger.log(`Task ${taskId} and associated data deleted by user ${userId}`);
    return { message: '删除成功' };
  }

  private async downloadToLocal(url: string, prefix: string): Promise<string> {
    if (!url.startsWith('http')) return url;
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = path.extname(url.split('?')[0]) || '.mp4';
    const filename = `${prefix}_${Date.now()}${ext}`;
    const localPath = path.join(outputDir, filename);
    try {
      await downloadToFile(url, localPath, { timeoutMs: 60000 });
      this.logger.log(`Downloaded to local: ${filename}`);
      return `/static/${filename}`;
    } catch (err: any) {
      this.logger.warn(`Download failed, using original URL: ${err.message}`);
      return url;
    }
  }
}
