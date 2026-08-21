import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, UseInterceptors, UploadedFile, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MediaService } from './media.service';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|webm|mkv|avi|m4v|mp3|wav|m4a|flac|ogg|webma)$/i;
const ALLOWED_MIME = /^(image|video|audio)\//;

function uploadInterceptor() {
  const dir = path.resolve(process.cwd(), 'output');
  return FileInterceptor('file', {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        // Generate a server-controlled name; user input never lands in the filename
        cb(null, `upload_${Date.now()}_${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: 300 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_EXT.test(file.originalname) && ALLOWED_MIME.test(file.mimetype)) cb(null, true);
      else cb(new BadRequestException('不支持的文件类型，仅允许图片/视频/音频（jpg/png/gif/webp/mp4/mov/webm/mkv/avi/m4v/mp3/wav/m4a/flac/ogg）'), false);
    },
  });
}

@Controller('api/media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  list(@Req() req, @Query() query: { type?: string; project_id?: number; page?: number; limit?: number }) {
    return this.mediaService.list(req.user.id, query);
  }

  @Get(':id')
  get(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.mediaService.getById(req.user.id, id);
  }

  @Post('upload')
  @UseInterceptors(uploadInterceptor())
  async upload(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传文件');

    // 单用户存储限额检查（默认 500MB，可配置 user_storage_limit_mb）
    const limitRows = await this.dataSource.query(
      `SELECT COALESCE(config_value, '500') AS val FROM system_configs WHERE config_key='user_storage_limit_mb' LIMIT 1`,
    );
    const limitMB = limitRows?.[0]?.val ?? '500';
    const limitBytes = (Number(limitMB) || 500) * 1024 * 1024;

    const usedRows = await this.dataSource.query(
      'SELECT COALESCE(SUM(file_size), 0) AS used FROM media_files WHERE user_id = ?',
      [req.user.id],
    );
    const used = Number(usedRows?.[0]?.used ?? 0);
    if (used + file.size > limitBytes) {
      const usedMB = (used / 1024 / 1024).toFixed(0);
      const limitMBVal = (limitBytes / 1024 / 1024).toFixed(0);
      throw new BadRequestException(`存储空间不足（已用 ${usedMB}MB / 限额 ${limitMBVal}MB），请清理后再试`);
    }

    const originalName = path.basename(file.originalname);
    const record = await this.mediaService.create(req.user.id, {
      type: file.mimetype.startsWith('video') ? 'video' : file.mimetype.startsWith('audio') ? 'audio' : 'image',
      url: `/static/${file.filename}`,
      original_name: originalName,
      mime_type: file.mimetype,
      file_size: file.size,
    });
    return { id: record.id, url: `/static/${file.filename}`, original_name: originalName };
  }

  @Post()
  create(@Req() req, @Body() body: Partial<{
    project_id: number; task_id: number; type: string; url: string;
    thumbnail_url: string; original_name: string; mime_type: string;
    file_size: number; width: number; height: number; duration: number;
    tags: string; metadata: string;
  }>) {
    return this.mediaService.create(req.user.id, body);
  }

  @Delete(':id')
  delete(@Req() req, @Param('id', ParseIntPipe) id: number) {
    return this.mediaService.delete(req.user.id, id);
  }
}
