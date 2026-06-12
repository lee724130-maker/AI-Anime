import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  StreamableFile,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { VideoService } from './video.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('api/video')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('generate')
  create(
    @Body() body: {
      script_id?: number;
      character_id?: number;
      character_name?: string;
      character_desc?: string;
      prompt?: string;
      resolution?: string;
      duration?: number;
      style?: string;
      model?: string;
      settings?: Record<string, any>;
    },
    @Req() req,
  ) {
    return this.videoService.create(req.user.id, body);
  }

  @Get('list')
  list(@Query('page') page: number, @Query('limit') limit: number, @Req() req) {
    return this.videoService.findByUser(req.user.id, page || 1, limit || 20);
  }

  @Get('task/:taskId')
  taskStatus(@Param('taskId') taskId: string, @Req() req) {
    return this.videoService.findByTaskId(req.user.id, taskId);
  }

  /** Public endpoint: serve video/image files so browser can play them */
  @Public()
  @Get('file/:filename')
  serveFile(@Param('filename') filename: string, @Res({ passthrough: true }) res: Response) {
    const outputDir = path.resolve(process.cwd(), 'output');
    const filePath = path.join(outputDir, filename);

    // Security: prevent directory traversal
    if (!filePath.startsWith(outputDir)) {
      throw new NotFoundException('文件不存在');
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('文件不存在');
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.mp3': 'audio/mpeg',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');

    // Support range requests for video seeking
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = res.req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);

      const stream = fs.createReadStream(filePath, { start, end });
      return new StreamableFile(stream);
    }

    res.setHeader('Content-Length', fileSize);
    const stream = fs.createReadStream(filePath);
    return new StreamableFile(stream);
  }

  @Get(':id')
  detail(@Param('id') id: number, @Req() req) {
    return this.videoService.findOne(id, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Req() req) {
    return this.videoService.remove(id, req.user.id);
  }
}
