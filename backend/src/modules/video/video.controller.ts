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
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { VideoService } from './video.service';
import { FileUrlService } from '../../common/security/file-url.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('api/video')
@UseGuards(JwtAuthGuard)
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly fileUrl: FileUrlService,
  ) {}

  @Post('generate')
  create(
    @Body() body: {
      script_id?: number;
      script_title?: string;
      character_id?: number;
      character_name?: string;
      character_desc?: string;
      characters?: Array<{ character_id?: number; character_name?: string; character_desc?: string }>;
      prompt?: string;
      resolution?: string;
      ratio?: string;
      duration?: number;
      style?: string;
      model?: string;
      settings?: Record<string, any>;
    },
    @Req() req,
  ) {
    return this.videoService.create(req.user.id, body);
  }

  @Post('batch-generate')
  batchGenerate(
    @Body() body: {
      script_id: number;
      character_id?: number;
      character_name?: string;
      character_desc?: string;
      characters?: Array<{ character_id?: number; character_name?: string; character_desc?: string }>;
      resolution?: string;
      ratio?: string;
      duration?: number;
      style?: string;
      model?: string;
    },
    @Req() req,
  ) {
    return this.videoService.batchCreate(req.user.id, body);
  }

  @Get('list')
  list(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('search') search: string,
    @Query('status') status: string,
    @Query('resolution') resolution: string,
    @Query('sort_by') sort_by: string,
    @Query('sort_order') sort_order: 'ASC' | 'DESC',
    @Req() req,
  ) {
    return this.videoService.findByUser(req.user.id, page || 1, limit || 20, {
      search, status, resolution, sort_by, sort_order,
    });
  }

  @Get('task/:taskId')
  taskStatus(@Param('taskId') taskId: string, @Req() req) {
    return this.videoService.findByTaskId(req.user.id, taskId);
  }

  /** Serve video/image files (requires auth) */
  @Get('file/:filename')
  serveFile(
    @Param('filename') filename: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outputDir = path.resolve(process.cwd(), 'output');
    const filePath = path.join(outputDir, filename);

    // Security: prevent directory traversal（L1：加 path.sep，防 `../outputEvil` 兄弟目录前缀穿透）
    if (!filePath.startsWith(outputDir + path.sep)) {
      throw new NotFoundException('文件不存在');
    }

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('文件不存在');
    }

    /**
     * 越权修复（2026-11-23）：本接口原先只校验「路径不越界 + 文件存在」，
     * 任何登录用户换个文件名就能取走别人的产物（实测 200 返回完整文件）。
     * 现在只认与 /static 同一套 HMAC 签名；管理员额外放行，便于排障。
     * 前端与后台均未调用过本接口（全仓 grep `video/file` 零命中），因此不影响现有功能。
     */
    const signed = this.fileUrl.verify(`/static/${filename}`, exp, sig);
    if (!signed) {
      const isAdmin = req?.user?.role === 'admin' || req?.user?.is_super_admin === true;
      if (!isAdmin) throw new ForbiddenException('无权访问该文件');
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

    const isDownload = res.req.query?.download === '1';
    if (isDownload) {
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Length', stat.size);
      const stream = fs.createReadStream(filePath);
      return new StreamableFile(stream);
    }

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

  @Get('defaults')
  defaults() {
    return this.videoService.getDefaults();
  }

  @Post('stitch')
  async stitch(
    @Body() body: { video_ids: number[]; clips?: Array<{ id: number; start?: number; end?: number }> },
    @Req() req,
  ) {
    return this.videoService.stitch(req.user.id, body.video_ids, body.clips);
  }

  @Post('batch-delete')
  batchDelete(@Body() body: { ids: number[] }, @Req() req) {
    return this.videoService.batchRemove(body.ids, req.user.id);
  }

  @Post('batch-download')
  async batchDownload(@Body() body: { ids: number[] }, @Req() req, @Res({ passthrough: true }) res: Response) {
    return this.videoService.batchDownload(req.user.id, body.ids, res);
  }

  @Post(':id/retry')
  retry(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.videoService.retry(id, req.user.id);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.videoService.findOne(id, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return this.videoService.remove(id, req.user.id);
  }
}
