import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelConfig } from './model-config.entity';

@Injectable()
export class ModelConfigService {
  constructor(
    @InjectRepository(ModelConfig)
    private readonly repo: Repository<ModelConfig>,
  ) {}

  async findActive(capability: string, subCapability?: string) {
    const where: any = { capability, status: 'active' };
    if (subCapability) {
      where.sub_capability = subCapability;
    }
    return this.repo.find({
      where,
      order: { priority: 'ASC' },
    });
  }

  async findActiveBySubCapability(subCapability: string) {
    return this.repo.find({
      where: { sub_capability: subCapability, status: 'active' },
      order: { priority: 'ASC' },
    });
  }

  async list(page = 1, limit = 50) {
    const [items, total] = await this.repo.findAndCount({
      order: { provider: 'ASC', capability: 'ASC', priority: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(id: number) {
    const model = await this.repo.findOne({ where: { id } });
    if (!model) throw new NotFoundException('模型配置不存在');
    return model;
  }

  async create(data: Partial<ModelConfig>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<ModelConfig>) {
    const model = await this.getById(id);
    Object.assign(model, data);
    return this.repo.save(model);
  }

  async delete(id: number) {
    const model = await this.getById(id);
    return this.repo.remove(model);
  }
}
