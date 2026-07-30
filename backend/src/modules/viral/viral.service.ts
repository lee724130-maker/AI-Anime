import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { ViralTemplate } from './viral-template.entity';
import { ViralProject } from './viral-project.entity';
import { CreateTemplateDto, UpdateTemplateDto, CreateProjectDto, UpdateProjectDto } from './viral.dto';

@Injectable()
export class ViralService {
  private readonly logger = new Logger(ViralService.name);

  constructor(
    @InjectRepository(ViralTemplate)
    private readonly templateRepo: Repository<ViralTemplate>,
    @InjectRepository(ViralProject)
    private readonly projectRepo: Repository<ViralProject>,
  ) {}

  // ───── Templates ─────

  async listTemplates(query: {
    category?: string; keyword?: string; sort?: string;
    page?: number; limit?: number;
  }) {
    const { category, keyword, sort, page = 1, limit = 20 } = query;
    const where: any = { status: 'active' };
    if (category && category !== 'all') where.category = category;
    if (keyword) where.name = Like(`%${keyword}%`);

    const order: any = sort === 'popular' ? { usage_count: 'DESC' } : { created_at: 'DESC' };

    const [items, total] = await this.templateRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    const parsed = items.map(t => ({
      ...t,
      tags: t.tags ? JSON.parse(t.tags) : [],
    }));

    return { items: parsed, total, page, limit };
  }

  async getTemplateById(id: number) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    return {
      ...tpl,
      tags: tpl.tags ? JSON.parse(tpl.tags) : [],
      scenes: tpl.scenes ? JSON.parse(tpl.scenes) : [],
      variables: tpl.variables ? JSON.parse(tpl.variables) : [],
      reference_frames: tpl.reference_frames ? JSON.parse(tpl.reference_frames) : null,
      audio: tpl.audio ? JSON.parse(tpl.audio) : null,
    };
  }

  async createTemplate(dto: CreateTemplateDto) {
    if (!dto.name) throw new BadRequestException('模板名称不能为空');
    const tpl = this.templateRepo.create({
      ...dto,
      tags: dto.tags || '[]',
      scenes: dto.scenes || '[]',
      variables: dto.variables || '[]',
    });
    return this.templateRepo.save(tpl);
  }

  async updateTemplate(id: number, dto: UpdateTemplateDto) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    Object.assign(tpl, dto);
    return this.templateRepo.save(tpl);
  }

  async deleteTemplate(id: number) {
    const tpl = await this.templateRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('模板不存在');
    await this.templateRepo.remove(tpl);
    return { deleted: true };
  }

  async getCategories() {
    const result = await this.templateRepo
      .createQueryBuilder('t')
      .select('t.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('t.status = :status', { status: 'active' })
      .groupBy('t.category')
      .orderBy('count', 'DESC')
      .getRawMany();
    return result.map(r => ({ category: r.category, count: Number(r.count) }));
  }

  async incrementUsage(id: number) {
    await this.templateRepo.increment({ id }, 'usage_count', 1);
  }

  // ───── Projects ─────

  async listProjects(userId: number) {
    const items = await this.projectRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
    return items.map(p => ({
      ...p,
      variables: p.variables ? JSON.parse(p.variables) : [],
      scenes: p.scenes ? JSON.parse(p.scenes) : [],
    }));
  }

  async getProjectById(id: number, userId: number) {
    const project = await this.projectRepo.findOne({
      where: { id, user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');
    return {
      ...project,
      variables: project.variables ? JSON.parse(project.variables) : [],
      scenes: project.scenes ? JSON.parse(project.scenes) : [],
    };
  }

  async createProject(userId: number, dto: CreateProjectDto) {
    const tpl = await this.templateRepo.findOne({ where: { id: dto.template_id } });
    if (!tpl) throw new NotFoundException('模板不存在');

    let variables: any[];
    try {
      variables = JSON.parse(dto.variables);
    } catch {
      throw new BadRequestException('variables 必须是有效的 JSON');
    }

    const project = this.projectRepo.create({
      user_id: userId,
      template_id: dto.template_id,
      name: dto.name,
      variables: dto.variables,
      scenes: tpl.scenes,
      status: 'pending',
      progress: 0,
    });

    await this.incrementUsage(dto.template_id);
    return this.projectRepo.save(project);
  }

  async updateProject(id: number, userId: number, dto: UpdateProjectDto) {
    const project = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!project) throw new NotFoundException('项目不存在');
    Object.assign(project, dto);
    return this.projectRepo.save(project);
  }

  async deleteProject(id: number, userId: number) {
    const project = await this.projectRepo.findOne({ where: { id, user_id: userId } });
    if (!project) throw new NotFoundException('项目不存在');
    await this.projectRepo.remove(project);
    return { deleted: true };
  }

  // ───── Stats ─────

  async getStats() {
    const [templateCount, projectCount] = await Promise.all([
      this.templateRepo.count({ where: { status: 'active' } }),
      this.projectRepo.count(),
    ]);
    return { templateCount, projectCount };
  }
}
