import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromptTemplate } from './prompt-template.entity';

@Injectable()
export class PromptTemplateService {
  constructor(
    @InjectRepository(PromptTemplate)
    private readonly repo: Repository<PromptTemplate>,
  ) {}

  async find(provider?: string, capability?: string) {
    const where: any = { status: 'active' };
    if (provider) where.provider = provider;
    if (capability) where.capability = capability;
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async list(page = 1, limit = 50) {
    const [items, total] = await this.repo.findAndCount({
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getById(id: number) {
    const tpl = await this.repo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('提示词模板不存在');
    return tpl;
  }

  async create(data: Partial<PromptTemplate>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: number, data: Partial<PromptTemplate>) {
    const tpl = await this.getById(id);
    Object.assign(tpl, data);
    return this.repo.save(tpl);
  }

  async delete(id: number) {
    const tpl = await this.getById(id);
    return this.repo.remove(tpl);
  }
}
