import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Script } from './script.entity';
import { VideoTask } from '../video/video.entity';

@Injectable()
export class ScriptService {
  constructor(
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
  ) {}

  async create(userId: number, dto: { title?: string; content: string }) {
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
    // Nullify script reference in any video tasks to avoid FK constraint violation
    await this.videoRepo.update({ script_id: id }, { script_id: null as any });
    return this.scriptRepo.remove(script);
  }
}
