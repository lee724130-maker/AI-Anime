import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CanvasService } from './canvas.service';
import {
  CreateCanvasProjectDto,
  UpdateCanvasProjectDto,
  ListCanvasTemplateQuery,
  CreateCanvasTemplateDto,
  UpdateCanvasTemplateDto,
  SaveAsTemplateDto,
} from './canvas.dto';

@Controller('api/canvas')
@UseGuards(JwtAuthGuard)
export class CanvasController {
  constructor(private readonly service: CanvasService) {}

  // ───── Projects ─────

  @Get('projects')
  listProjects(@Req() req) {
    return this.service.listProjects(req.user.id);
  }

  @Post('projects')
  createProject(@Req() req, @Body() dto: CreateCanvasProjectDto) {
    return this.service.createProject(req.user.id, dto);
  }

  @Get('projects/:id')
  getProject(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getProjectById(id, req.user.id);
  }

  @Put('projects/:id')
  updateProject(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCanvasProjectDto) {
    return this.service.updateProject(id, req.user.id, dto);
  }

  @Delete('projects/:id')
  deleteProject(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteProject(id, req.user.id);
  }

  @Post('projects/:id/render')
  renderProject(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.startRender(id, req.user.id);
  }

  @Get('projects/:id/export')
  getExport(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getProjectResult(id, req.user.id);
  }

  @Post('projects/:id/save-as-template')
  saveAsTemplate(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: SaveAsTemplateDto) {
    return this.service.saveAsTemplate(id, req.user.id, dto);
  }

  // ───── Templates ─────

  @Get('templates')
  listTemplates(@Req() req, @Query() query: ListCanvasTemplateQuery) {
    return this.service.listTemplates(req.user.id, query);
  }

  @Get('templates/:id')
  getTemplate(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getTemplateById(id, req.user.id);
  }

  @Post('templates')
  createTemplate(@Req() req, @Body() dto: CreateCanvasTemplateDto) {
    return this.service.createTemplate(req.user, dto);
  }

  @Put('templates/:id')
  updateTemplate(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCanvasTemplateDto) {
    return this.service.updateTemplate(id, dto, req.user);
  }

  @Delete('templates/:id')
  deleteTemplate(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteTemplate(id, req.user);
  }

  @Post('templates/:id/duplicate')
  duplicateTemplate(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.duplicateTemplate(req.user.id, id);
  }
}