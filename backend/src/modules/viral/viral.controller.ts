import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards, Req, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ViralService } from './viral.service';
import { CreateTemplateDto, UpdateTemplateDto, CreateProjectDto, UpdateProjectDto, ListTemplateQuery, AnalyzeVideoDto, RegenerateSceneDto } from './viral.dto';

const ALLOWED_VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi|m4v)$/i;
const ALLOWED_VIDEO_MIME = /^video\//;

function analyzeUploadInterceptor() {
  const dir = path.resolve(process.cwd(), 'output');
  return FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `upload_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: 300 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_VIDEO_EXT.test(file.originalname) && ALLOWED_VIDEO_MIME.test(file.mimetype)) cb(null, true);
      else cb(new BadRequestException('不支持的文件类型，仅允许视频（mp4/mov/webm/mkv/avi/m4v）'), false);
    },
  });
}

@Controller('api/viral')
@UseGuards(JwtAuthGuard)
export class ViralController {
  constructor(private readonly service: ViralService) {}

  // ───── Templates ─────

  @Get('templates')
  listTemplates(@Req() req, @Query() query: ListTemplateQuery) {
    return this.service.listTemplates(query, req.user?.id);
  }

  @Get('templates/:id')
  getTemplate(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getTemplateById(id, req.user?.id);
  }

  @Post('templates')
  createTemplate(@Req() req, @Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(dto, req.user);
  }

  @Post('templates/analyze')
  analyzeVideo(@Req() req, @Body() dto: AnalyzeVideoDto) {
    return this.service.analyzeVideo(dto, req.user.id);
  }

  @Post('templates/analyze-upload')
  @UseInterceptors(analyzeUploadInterceptor())
  analyzeUpload(@Req() req, @UploadedFile() file: Express.Multer.File, @Body() body: { name?: string; category?: string; description?: string }) {
    if (!file) throw new BadRequestException('请上传视频文件');
    return this.service.analyzeUploadedVideo(file, body, req.user.id);
  }

  @Post('templates/:id/duplicate')
  duplicateTemplate(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.duplicateTemplate(id, req.user.id);
  }

  @Post('templates/:id/refresh-source')
  refreshTemplateSource(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.refreshTemplateSourceVideo(id, req.user);
  }

  @Put('templates/:id')
  updateTemplate(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.service.updateTemplate(id, dto, req.user);
  }

  @Delete('templates/:id')
  deleteTemplate(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteTemplate(id, req.user);
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

  // ───── Generation ─────

  @Post('projects/:id/generate')
  startGeneration(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.startGeneration(id, req.user.id);
  }

  @Post('projects/:id/regenerate-scene')
  regenerateScene(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: RegenerateSceneDto) {
    return this.service.regenerateScene(id, req.user.id, dto.sceneIndex);
  }

  @Get('projects/:id/result')
  getResult(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getProjectResult(id, req.user.id);
  }

  // ───── Stats ─────

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('credit-rules')
  getCreditRules() {
    return this.service.getViralCreditRules();
  }
}
