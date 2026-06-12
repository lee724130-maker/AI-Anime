import { BadRequestException, Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { VideoTask } from './video.entity';
import { User } from '../user/user.entity';
import { SystemConfig } from '../admin/admin.entity';

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
    @InjectQueue('video')
    private readonly videoQueue: Queue | null,
  ) {}

  /** Create a video generation task and push to queue */
  async create(
    userId: number,
    dto: {
      script_id?: number;
      script_title?: string;
      character_id?: number;
      character_name?: string;
      character_desc?: string;
      prompt?: string;
      resolution?: string;
      duration?: number;
      style?: string;
      model?: string;
      settings?: Record<string, any>;
    },
  ) {
    const taskId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resolution = dto.resolution || '720p';
    const duration = Number(dto.duration || 5);
    const style = dto.style || 'anime';
    const creditCost = await this.estimateCreditCost(resolution, duration);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    if ((user.credits || 0) < creditCost) {
      throw new BadRequestException(`算力不足，本次预计需要 ${creditCost} 算力`);
    }

    const saved = await this.videoRepo.save({
      user_id: userId,
      script_id: dto.script_id ?? undefined,
      task_id: taskId,
      status: 'pending',
      resolution,
      duration,
      style,
      model_name: dto.model || null,
      credit_cost: creditCost,
      progress: 0,
    } as any);

    // Try to push job to Bull queue (non-blocking, with timeout)
    if (this.videoQueue) {
      try {
        const jobPromise = this.videoQueue.add('generate', {
          taskId: saved.id,
          userId,
          scriptId: dto.script_id,
          scriptTitle: dto.script_title,
          characterId: dto.character_id,
          characterName: dto.character_name,
          characterDesc: dto.character_desc,
          prompt: dto.prompt,
          resolution,
          duration,
          style,
          model: dto.model || '',
          settings: dto.settings,
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

  /** Get tasks list for a user */
  async findByUser(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.videoRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['script'],
    });
    return {
      items: items.map((t) => ({
        ...t,
        scriptTitle: t.script?.title || null,
        script: undefined, // strip relation object
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
    },
  ) {
    const task = await this.videoRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    Object.assign(task, data);
    return this.videoRepo.save(task);
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

  async chargeForCompletedTask(id: number) {
    const task = await this.videoRepo.findOne({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.credits_charged || task.status !== 'completed') return task;

    const user = await this.userRepo.findOne({ where: { id: task.user_id } });
    if (!user) throw new NotFoundException('用户不存在');

    user.credits = Math.max(0, (user.credits || 0) - (task.credit_cost || 0));
    task.credits_charged = true;

    await this.userRepo.save(user);
    return this.videoRepo.save(task);
  }
}
