import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MediaService } from './media.service';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|webm|mkv|avi|m4v)$/i;
const ALLOWED_MIME = /^(image|video)\//;

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
      else cb(new BadRequestException('不支持的文件类型，仅允许图片/视频（jpg/png/gif/webp/mp4/mov/webm/mkv/avi/m4v）'), false);
    },
  });
}

@Controller('api/media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  list(@Req() req, @Query() query: { type?: string; project_id?: number; page?: number; limit?: number }) {
    return this.mediaService.list(req.user.id, query);
  }

  @Get(':id')
  get(@Req() req, @Param('id') id: number) {
    return this.mediaService.getById(req.user.id, id);
  }

  @Post('upload')
  @UseInterceptors(uploadInterceptor())
  async upload(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请上传文件');
    const originalName = path.basename(file.originalname);
    const record = await this.mediaService.create(req.user.id, {
      type: file.mimetype.startsWith('video') ? 'video' : 'image',
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
  delete(@Req() req, @Param('id') id: number) {
    return this.mediaService.delete(req.user.id, id);
  }
}
