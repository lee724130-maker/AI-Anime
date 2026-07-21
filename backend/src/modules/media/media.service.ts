import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaFile } from './media-file.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaFile)
    private readonly repo: Repository<MediaFile>,
  ) {}

  async list(userId: number, query: { type?: string; project_id?: number; page?: number; limit?: number }) {
    const where: any = { user_id: userId };
    if (query.type) where.type = query.type;
    if (query.project_id) where.project_id = query.project_id;

    const page = query.page || 1;
    const limit = query.limit || 20;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(userId: number, id: number) {
    const file = await this.repo.findOne({ where: { id, user_id: userId } });
    if (!file) throw new NotFoundException('文件不存在');
    return file;
  }

  async create(userId: number, data: Partial<MediaFile>) {
    const file = this.repo.create({ ...data, user_id: userId });
    return this.repo.save(file);
  }

  async delete(userId: number, id: number) {
    const file = await this.getById(userId, id);
    return this.repo.remove(file);
  }
}
