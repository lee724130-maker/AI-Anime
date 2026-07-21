import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { VideoTask } from './video.entity';
import { User } from '../user/user.entity';
import { SystemConfig } from '../admin/admin.entity';
import { Script } from '../script/script.entity';
import { Character } from '../character/character.entity';
import { AIServiceUtil } from '../../utils/ai-service.util';
import { FFmpegUtil } from '../../utils/ffmpeg.util';
import * as path from 'path';
import * as fs from 'fs';
import * as archiver from 'archiver';
import axios from 'axios';
import type { Response } from 'express';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SystemConfig)
    private readonly configRepo: Repository<SystemConfig>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
    @InjectQueue('video')
    private readonly videoQueue: Queue | null,
    private readonly dataSource: DataSource,
    private readonly aiService: AIServiceUtil,
    private readonly ffmpeg: FFmpegUtil,
  ) {}

  /** Download remote URL to local output/ and return web-served path */
  private async downloadToLocal(url: string, prefix: string): Promise<string> {
    if (!url.startsWith('http')) return url;
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const ext = path.extname(url.split('?')[0]) || '.jpg';
    const filename = `${prefix}_${Date.now()}${ext}`;
    const localPath = path.join(outputDir, filename);
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      fs.writeFileSync(localPath, Buffer.from(response.data));
      return `/static/${filename}`;
    } catch {
      return url;
    }
  }

  /** Create a video generation task and push to queue */
  async create(
    userId: number,
    dto: {
      script_id?: number;
      script_title?: string;
      character_id?: number;
      character_name?: string;
      character_desc?: string;
      characters?: Array<{ character_id?: number; character_name?: string; character_desc?: string }>;
      prompt?: string;
      resolution?: string;
      ratio?: string;
      duration?: number;
      style?: string;
      model?: string;
      settings?: Record<string, any>;
      reference_image?: string;
    },
  ) {
    const taskId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resolution = dto.resolution || '720p';
    const ratio = dto.ratio || '9:16';
    const duration = Number(dto.duration || 5);
    const style = dto.style || 'anime';
    const creditCost = await this.estimateCreditCost(resolution, duration);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if ((user.credits || 0) < creditCost) {
      throw new BadRequestException(`算力不足，本次预计需要 ${creditCost} 算力`);
    }

    // Determine primary character (first from array, or legacy single fields)
    const primaryChar = Array.isArray(dto.characters) && dto.characters.length > 0
      ? dto.characters[0]
      : null;
    const charId = primaryChar?.character_id || dto.character_id;
    const charName = primaryChar?.character_name || dto.character_name;
    const charDesc = primaryChar?.character_desc || dto.character_desc;

    // Use character's stored reference image or pre-generate one (style-specific)
    let referenceImage = dto.reference_image || '';
    if (!referenceImage && charId) {
      const char = await this.characterRepo.findOne({ where: { id: charId, user_id: userId } });
      if (char) {
        referenceImage = style === 'realistic' ? (char.reference_image_realistic || '') : (char.reference_image_anime || '');
        if (!referenceImage && char.avatar_url) {
          referenceImage = char.avatar_url;
        }
        if (referenceImage) {
          this.logger.log(`Using character's stored ${style} reference image for task`);
        }
      }
    }
      if (!referenceImage && (charName || charDesc)) {
      try {
        const charPrompt = charDesc
          ? `Character ${charName || ''}: ${charDesc}, full body, front view, high quality`
          : `character: ${charName || 'unknown'}, full body, front view`;
        const [rw, rh] = ratio.split(':').map(Number);
        const base = parseInt(resolution);
        const imgW = rw <= rh ? base : Math.round(base * rw / rh);
        const imgH = rw <= rh ? Math.round(base * rh / rw) : base;
        const images = await this.aiService.generateImage({ prompt: charPrompt, width: imgW, height: imgH, numImages: 1, style });
        if (images.length > 0) {
          referenceImage = await this.downloadToLocal(images[0], `ref_${taskId}`);
          this.logger.log(`Pre-generated character reference image saved locally`);
        }
      } catch (imgErr: any) {
        this.logger.warn(`Character image pre-generation failed (${imgErr.message})`);
      }
    }

    const jobData = {
      taskId: '__placeholder__',
      userId,
      scriptId: dto.script_id,
      scriptTitle: dto.script_title || '',
      characterId: charId,
      characterName: charName || '',
      characterDesc: charDesc || '',
      characters: dto.characters || [],
      prompt: dto.prompt,
      resolution,
      ratio,
      duration,
      style,
      model: dto.model || '',
      settings: dto.settings,
      referenceImage: referenceImage || '',
      sceneIndex: dto.settings?.scene_index,
    };

    const saved = await this.videoRepo.save({
      user_id: userId,
      script_id: dto.script_id ?? undefined,
      task_id: taskId,
      status: 'pending',
      resolution,
      ratio,
      duration,
      style,
      model_name: dto.model || null,
      credit_cost: creditCost,
      progress: 0,
      reference_image: referenceImage || null,
      prompt: dto.prompt || null,
      job_data: JSON.stringify(jobData),
    } as any);

    // Try to push job to Bull queue (non-blocking, with timeout)
    if (this.videoQueue) {
      try {
        const jobPromise = this.videoQueue.add('generate', {
          taskId: saved.id,
          userId,
          scriptId: dto.script_id,
          scriptTitle: dto.script_title,
          characterId: charId,
          characterName: charName,
          characterDesc: charDesc,
          characters: dto.characters || [],
          prompt: dto.prompt,
          resolution,
          ratio,
          duration,
          style,
          model: dto.model || '',
          settings: dto.settings,
          referenceImage: referenceImage || '',
          sceneIndex: dto.settings?.scene_index,
        });

        // Set a 3-second timeout for queue push
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Queue push timeout')), 3000),
        );

        await Promise.race([jobPromise, timeoutPromise]);
        this.logger.log(`Job pushed to queue for task #${saved.id}`);
      } catch (err: any) {
        this.logger.warn(`Queue push failed (Redis may be unavailable): ${err.message}. Task saved as pending.`);
        // Task remains in 'pending' status — system will pick up pending tasks later
      }
    } else {
      this.logger.warn('Queue not initialized. Task saved as pending.');
    }

    return saved;
  }

  /** Split a script into scenes and create one video task per scene */
  async batchCreate(
    userId: number,
    dto: {
      script_id: number;
      character_id?: number;
      character_name?: string;
      character_desc?: string;
      characters?: Array<{ character_id?: number; character_name?: string; character_desc?: string }>;
      resolution?: string;
      ratio?: string;
      duration?: number;
      style?: string;
      model?: string;
    },
  ) {
    const script = await this.scriptRepo.findOne({ where: { id: dto.script_id, user_id: userId } });
    if (!script) throw new NotFoundException('剧本不存在');

    // Split content into scenes
    const raw = script.content || '';
    const separators = ['\n---\n', '\n---\r\n', '\r\n---\r\n', '\n\n', '\r\n\r\n'];
    let scenes: string[] = [];

    // Try markdown separator first
    for (const sep of separators.filter(s => s.includes('---'))) {
      const parts = raw.split(sep).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) { scenes = parts; break; }
    }

    // Fallback: split by double newline
    if (scenes.length === 0) {
      scenes = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    }

    // If only one scene, treat whole content as one
    if (scenes.length <= 1) {
      scenes = [raw.trim()].filter(Boolean);
    }

    if (scenes.length === 0) {
      throw new BadRequestException('剧本内容为空，无法拆分');
    }

    const resolution = dto.resolution || '720p';
    const ratio = dto.ratio || '9:16';
    const duration = Number(dto.duration || 5);
    const style = dto.style || 'anime';
    const creditCost = await this.estimateCreditCost(resolution, duration);
    const totalCost = creditCost * scenes.length;

    // Check user credits
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if ((user.credits || 0) < totalCost) {
      throw new BadRequestException(
        `批量生成共需 ${totalCost} 算力（${scenes.length} 场景 × ${creditCost}），当前仅 ${user.credits || 0}`,
      );
    }

    // Determine primary character (first from array, or legacy single fields)
    const primaryChar = Array.isArray(dto.characters) && dto.characters.length > 0
      ? dto.characters[0]
      : null;
    const charId = primaryChar?.character_id || dto.character_id;
    const charName = primaryChar?.character_name || dto.character_name;
    const charDesc = primaryChar?.character_desc || dto.character_desc;

    // Use character's stored reference image or pre-generate one (style-specific)
    let referenceImage = '';
    if (charId) {
      const char = await this.characterRepo.findOne({ where: { id: charId, user_id: userId } });
      if (char) {
        referenceImage = style === 'realistic' ? (char.reference_image_realistic || '') : (char.reference_image_anime || '');
        if (!referenceImage && char.avatar_url) {
          referenceImage = char.avatar_url;
        }
        if (referenceImage) {
          this.logger.log(`Using character's stored ${style} reference image for batch generation`);
        }
      }
    }
    if (!referenceImage && (charName || charDesc)) {
      try {
        const charPrompt = charDesc
          ? `Character ${charName || ''}: ${charDesc}, full body, front view, high quality`
          : `character: ${charName || 'unknown'}, full body, front view`;
        const [rw, rh] = ratio.split(':').map(Number);
        const base = parseInt(resolution);
        const imgW = rw <= rh ? base : Math.round(base * rw / rh);
        const imgH = rw <= rh ? Math.round(base * rh / rw) : base;
        const images = await this.aiService.generateImage({ prompt: charPrompt, width: imgW, height: imgH, numImages: 1, style });
        if (images.length > 0) {
          referenceImage = await this.downloadToLocal(images[0], `ref_batch_${dto.script_id}`);
          this.logger.log(`Pre-generated character reference image saved locally`);
        }
      } catch (imgErr: any) {
        this.logger.warn(`Character image pre-generation failed (${imgErr.message}), scenes will generate independently`);
      }
    }

    const created: any[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scenePrompt = `[场景 ${i + 1}/${scenes.length}] ${scenes[i]}`;
      const taskId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const task = await this.videoRepo.save({
        user_id: userId,
        script_id: dto.script_id,
        task_id: taskId,
        status: 'pending',
        resolution,
        ratio,
        duration,
        style,
        model_name: dto.model || null,
        credit_cost: creditCost,
        progress: 0,
        reference_image: referenceImage || null,
      } as any);

      created.push(task);

      // Push to queue
      if (this.videoQueue) {
        try {
          await this.videoQueue.add('generate', {
            taskId: task.id,
            userId,
            scriptId: dto.script_id,
            scriptTitle: `${script.title || '未命名'} - 场景 ${i + 1}`,
            characterId: charId,
            characterName: charName,
            characterDesc: charDesc,
            characters: dto.characters || [],
            prompt: scenePrompt,
            resolution,
            ratio,
            duration,
            style,
            model: dto.model || '',
            referenceImage,
          });
          this.logger.log(`Batch task #${task.id} pushed to queue (scene ${i + 1})`);
        } catch (err: any) {
          this.logger.warn(`Batch queue push failed for scene ${i + 1}: ${err.message}`);
        }
      }
    }

    return { total: created.length, scenes: scenes.length, creditCost, totalCost, tasks: created, referenceImage: referenceImage || undefined };
  }

  /** Get tasks list for a user */
  async findByUser(
    userId: number,
    page = 1,
    limit = 20,
    filters?: { search?: string; status?: string; resolution?: string; sort_by?: string; sort_order?: 'ASC' | 'DESC' },
  ) {
    const queryBuilder = this.videoRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.script', 'script')
      .where('v.user_id = :userId', { userId });

    if (filters?.status && filters.status !== 'all') {
      queryBuilder.andWhere('v.status = :status', { status: filters.status });
    }

    if (filters?.resolution) {
      queryBuilder.andWhere('v.resolution = :resolution', { resolution: filters.resolution });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(v.task_id LIKE :search OR script.title LIKE :search OR v.error_msg LIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const sortBy = filters?.sort_by === 'duration' ? 'v.duration' : 'v.created_at';
    const sortOrder = filters?.sort_order === 'ASC' ? 'ASC' : 'DESC';
    queryBuilder.orderBy(sortBy, sortOrder);

    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items: items.map((t) => ({
        ...t,
        scriptTitle: t.script?.title || null,
        script: undefined,
      })),
      total,
      page,
      limit,
    };
  }

  /** Get task by task_id (for polling) */
  async findByTaskId(userId: number, taskId: string) {
    const task = await this.videoRepo.findOne({
      where: { task_id: taskId, user_id: userId },
      relations: ['script'],
    });
    if (!task) throw new NotFoundException('任务不存在');
    const { script, ...rest } = task as any;
    return {
      ...rest,
      scriptTitle: script?.title || null,
    };
  }

  /** Get task by id */
  async findOne(id: number, userId: number) {
    const task = await this.videoRepo.findOne({
      where: { id, user_id: userId },
      relations: ['script'],
    });
    if (!task) throw new NotFoundException('视频任务不存在');
    const { script, ...rest } = task as any;
    return {
      ...rest,
      scriptTitle: script?.title || null,
    };
  }

  /** Update task status (called by queue processor) */
  async updateStatus(
    id: number,
    data: {
      status?: string;
      video_url?: string;
      cover_url?: string;
      error_msg?: string;
      retry_count?: number;
      completed_at?: Date;
      progress?: number;
      reference_image?: string;
    },
  ) {
    const task = await this.videoRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    Object.assign(task, data);
    return this.videoRepo.save(task);
  }

  /** Retry a failed video task */
  async retry(id: number, userId: number) {
    const task = await this.videoRepo.findOne({ where: { id, user_id: userId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.status !== 'failed') {
      throw new BadRequestException('只能重试失败的任务');
    }

    // Reset status
    task.status = 'pending';
    task.error_msg = null;
    task.progress = 0;
    task.retry_count = 0;
    task.completed_at = null;
    await this.videoRepo.save(task);

    // Re-push to queue
    if (this.videoQueue) {
      try {
        let jobData: any;
        if (task.job_data) {
          try { jobData = JSON.parse(task.job_data); } catch {}
        }
        if (!jobData) {
          jobData = {
            taskId: task.id,
            userId,
            scriptId: task.script_id,
            scriptTitle: '',
            characterId: null,
            characterName: '',
            characterDesc: '',
            characters: [],
            prompt: task.prompt || '',
            resolution: task.resolution || '720p',
            ratio: task.ratio || '9:16',
            duration: task.duration || 5,
            style: task.style || 'anime',
            model: task.model_name || '',
            settings: {},
            referenceImage: task.reference_image || '',
            sceneIndex: undefined,
          };
        }
        jobData.taskId = task.id;
        jobData.userId = userId;

        const jobPromise = this.videoQueue.add('generate', jobData);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Queue push timeout')), 3000),
        );
        await Promise.race([jobPromise, timeoutPromise]);
        this.logger.log(`Retry: job re-pushed to queue for task #${task.id}`);
      } catch (err: any) {
        this.logger.warn(`Retry queue push failed: ${err.message}`);
      }
    }

    return task;
  }

  /** Batch delete video tasks */
  async batchRemove(ids: number[], userId: number) {
    const tasks = await this.videoRepo.findBy({ id: In(ids) });
    const userTasks = tasks.filter(t => t.user_id === userId);
    if (userTasks.length === 0) throw new NotFoundException('没有可删除的视频');
    return this.videoRepo.remove(userTasks);
  }

  /** Batch download videos as zip */
  async batchDownload(userId: number, ids: number[], res: Response) {
    const tasks = await this.videoRepo.findBy({ id: In(ids) });
    const userTasks = tasks.filter(t => t.user_id === userId && t.status === 'completed' && t.video_url);
    if (userTasks.length === 0) throw new NotFoundException('没有可下载的已完成视频');

    const outputDir = path.resolve(process.cwd(), 'output');
    const archive = archiver('zip', { zlib: { level: 5 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="videos_${Date.now()}.zip"`);

    archive.pipe(res);

    for (const task of userTasks) {
      const filename = task.video_url?.replace('/static/', '') || '';
      const filePath = path.join(outputDir, filename);
      if (fs.existsSync(filePath)) {
        const displayName = `${task.id}_${task.script?.title || 'video'}${path.extname(filename)}`;
        archive.file(filePath, { name: displayName });
      }
    }

    await archive.finalize();
  }

  /** Delete a video task */
  async remove(id: number, userId: number) {
    const task = await this.findOne(id, userId);
    return this.videoRepo.remove(task as any);
  }

  /** Count tasks by status (for admin dashboard) */
  async countByStatus() {
    const all = await this.videoRepo.count();
    const completed = await this.videoRepo.count({ where: { status: 'completed' } });
    const processing = await this.videoRepo.count({ where: { status: 'processing' } });
    const failed = await this.videoRepo.count({ where: { status: 'failed' } });
    return { all, completed, processing, failed };
  }

  async estimateCreditCost(resolution = '720p', duration = 5) {
    const configKey = `credit_cost_${resolution}`;
    const record = await this.configRepo.findOne({ where: { config_key: configKey } });
    const defaults: Record<string, number> = { '480p': 5, '720p': 10, '1080p': 20 };
    const baseCost = Number(record?.config_value) || defaults[resolution] || defaults['720p'];
    const durationMultiplier = Math.max(1, Math.ceil(Number(duration || 5) / 5));
    return baseCost * durationMultiplier;
  }

  async getDefaults() {
    const keys = ['default_resolution', 'default_duration', 'default_style', 'default_model', 'default_ratio'];
    const configs: Record<string, string> = {};
    for (const key of keys) {
      const record = await this.configRepo.findOne({ where: { config_key: key } });
      configs[key.replace('default_', '')] = record?.config_value || '';
    }
    return {
      resolution: configs.resolution || '720p',
      duration: Number(configs.duration) || 5,
      style: configs.style || 'anime',
      model: configs.model || '',
      ratio: configs.ratio || '9:16',
    };
  }

  async chargeForCompletedTask(id: number) {
    const task = await this.videoRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.credits_charged || task.status !== 'completed') return task;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await queryRunner.manager.findOne(User, { where: { id: task.user_id } });
      if (!user) throw new NotFoundException('用户不存在');

      if ((user.credits || 0) < (task.credit_cost || 0)) {
        throw new BadRequestException(
          `用户算力不足，需要 ${task.credit_cost}，当前 ${user.credits || 0}。任务 #${id} 无法完成扣费`,
        );
      }

      user.credits = (user.credits || 0) - (task.credit_cost || 0);
      task.credits_charged = true;

      await queryRunner.manager.save(user);
      await queryRunner.manager.save(task);
      await queryRunner.commitTransaction();
      return task;
    } catch (err) {
      try { await queryRunner.rollbackTransaction(); } catch {}
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** Stitch multiple completed videos into one merged video.
   *  clips can optionally specify start/end trim times per video. */
  async stitch(
    userId: number,
    videoIds: number[],
    clips?: Array<{ id: number; start?: number; end?: number }>,
  ) {
    if (!videoIds || videoIds.length < 2) {
      throw new BadRequestException('至少需要选择 2 个视频进行拼接');
    }

    // Fetch all video tasks, verify ownership and completed status
    const tasks = await this.videoRepo.findBy({ id: In(videoIds) });
    const userTasks = tasks.filter(t => t.user_id === userId);
    if (userTasks.length !== videoIds.length) {
      throw new NotFoundException('部分视频不存在或无权访问');
    }

    const incomplete = userTasks.filter(t => t.status !== 'completed');
    if (incomplete.length > 0) {
      throw new BadRequestException(`以下视频尚未完成生成，无法拼接: #${incomplete.map(t => t.id).join(', #')}`);
    }

    // Build clip list with local file paths
    const outputDir = path.resolve(process.cwd(), 'output');
    const clipList = clips && clips.length > 0
      ? clips.map(c => {
          const task = userTasks.find(t => t.id === c.id);
          if (!task) throw new NotFoundException(`视频任务 #${c.id} 不存在`);
          const filename = task.video_url?.replace('/static/', '') || '';
          return { path: path.join(outputDir, filename), start: c.start, end: c.end };
        })
      : userTasks.map(t => {
          const filename = t.video_url?.replace('/static/', '') || '';
          return { path: path.join(outputDir, filename) };
        });

    // Merge via FFmpeg
    const mergedPath = await this.ffmpeg.mergeVideos(clipList);

    // Save as a new video task record
    const videoFilename = path.basename(mergedPath);
    const videoWebUrl = `/static/${videoFilename}`;
    const newTask = await this.videoRepo.save({
      user_id: userId,
      task_id: `stitch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'completed',
      video_url: videoWebUrl,
      completed_at: new Date(),
      progress: 100,
      credit_cost: 0,
      credits_charged: true,
    } as any);

    return {
      id: newTask.id,
      video_url: videoWebUrl,
      merged_from: userTasks.length,
      total_duration: '请查看视频文件属性', // actual duration would require ffprobe
    };
  }
}
