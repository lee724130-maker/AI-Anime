import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GenerationTask } from './generation-task.entity';
import { TaskEvent } from './task-event.entity';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(GenerationTask)
    private readonly taskRepo: Repository<GenerationTask>,
    @InjectRepository(TaskEvent)
    private readonly eventRepo: Repository<TaskEvent>,
  ) {}

  async list(userId: number, query: { type?: string; status?: string; project_id?: number; page?: number; limit?: number }) {
    const where: any = { user_id: userId };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.project_id) where.project_id = query.project_id;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await this.taskRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(userId: number, id: number) {
    const task = await this.taskRepo.findOne({ where: { id, user_id: userId } });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }

  async create(userId: number, data: Partial<GenerationTask>) {
    const task = this.taskRepo.create({ ...data, user_id: userId });
    const saved = await this.taskRepo.save(task);
    await this.addEvent(saved.id, null, saved.status, '任务创建');
    return saved;
  }

  async updateStatus(userId: number, id: number, status: string, extra?: { progress?: number; error_msg?: string; output_data?: string }) {
    const task = await this.getById(userId, id);
    const fromStatus = task.status;
    Object.assign(task, { status, ...extra });
    if (status === 'processing' && !task.started_at) task.started_at = new Date();
    if (status === 'completed' || status === 'failed') task.completed_at = new Date();
    const saved = await this.taskRepo.save(task);
    await this.addEvent(saved.id, fromStatus, status, extra?.error_msg || `状态变更: ${fromStatus} → ${status}`);
    return saved;
  }

  async getEvents(taskId: number) {
    return this.eventRepo.find({
      where: { task_id: taskId },
      order: { created_at: 'ASC' },
    });
  }

  private async addEvent(taskId: number, fromStatus: string | null, toStatus: string, message?: string) {
    const event = this.eventRepo.create({ task_id: taskId, from_status: fromStatus ?? undefined, to_status: toStatus, message });
    return this.eventRepo.save(event);
  }
}
