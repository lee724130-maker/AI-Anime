import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ViralService } from './viral.service';
import { CreateTemplateDto, UpdateTemplateDto, CreateProjectDto, UpdateProjectDto, ListTemplateQuery } from './viral.dto';

@Controller('api/viral')
@UseGuards(JwtAuthGuard)
export class ViralController {
  constructor(private readonly service: ViralService) {}

  // ───── Templates ─────

  @Get('templates')
  listTemplates(@Query() query: ListTemplateQuery) {
    return this.service.listTemplates(query);
  }

  @Get('templates/:id')
  getTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.service.getTemplateById(id);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(dto);
  }

  @Put('templates/:id')
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.service.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.service.deleteTemplate(id);
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  // ───── Projects ─────

  @Post('projects')
  createProject(@Req() req, @Body() dto: CreateProjectDto) {
    return this.service.createProject(req.user.id, dto);
  }

  @Get('projects')
  listProjects(@Req() req) {
    return this.service.listProjects(req.user.id);
  }

  @Get('projects/:id')
  getProject(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getProjectById(id, req.user.id);
  }

  @Put('projects/:id')
  updateProject(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProjectDto) {
    return this.service.updateProject(id, req.user.id, dto);
  }

  @Delete('projects/:id')
  deleteProject(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteProject(id, req.user.id);
  }

  // ───── Stats ─────

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }
}
