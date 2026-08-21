import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe,
  UseGuards, Req, UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EditorService } from './editor.service';
import { CreateEditorProjectDto, UpdateEditorProjectDto } from './editor.dto';

const ALLOWED_EXT = new Set([
  '.png', '.jpeg', '.jpg', '.gif', '.webp', '.bmp', '.svg',
  '.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v',
  '.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg',
]);

@Controller('api/editor')
@UseGuards(JwtAuthGuard)
export class EditorController {
  constructor(private readonly service: EditorService) {}

  // ───── Projects ─────

  @Get('projects')
  listProjects(@Req() req) {
    return this.service.listProjects(req.user.id);
  }

  @Post('projects')
  createProject(@Req() req, @Body() dto: CreateEditorProjectDto) {
    return this.service.createProject(req.user.id, dto);
  }

  @Get('projects/:id')
  getProject(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.getProjectById(id, req.user.id);
  }

  @Put('projects/:id')
  updateProject(@Req() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEditorProjectDto) {
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

  // ───── Concat (merge two videos) ─────

  @Post('concat')
  concat(@Body() body: { urlA: string; urlB: string }) {
    if (!body.urlA || !body.urlB) throw new BadRequestException('urlA and urlB are required');
    return this.service.concatVideos(body.urlA, body.urlB);
  }

  // ───── Local upload (video/image/audio for the timeline) ─────

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => cb(null, 'output'),
        filename: (req, file, cb) => {
          const ext = extname(file.originalname || '').toLowerCase();
          cb(null, `editor_upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
        },
      }),
      limits: { fileSize: 300 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        const mimeOk = /^(image|video|audio)\//.test(file.mimetype || '');
        if (!ALLOWED_EXT.has(ext) || !mimeOk) {
          return cb(new Error('仅支持图片/视频/音频文件（mp4/mov/webm/mp3/wav 等，≤300MB）'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@Req() req, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('文件上传失败');
    return { url: `/static/${file.filename}`, original_name: file.originalname };
  }
}