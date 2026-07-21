import { Controller, Get, Post, Delete, Body, Param, Query, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MediaService } from './media.service';
import * as fs from 'fs';
import * as path from 'path';

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
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Req() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error('请上传文件');
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const filename = `upload_${Date.now()}_${file.originalname}`;
    fs.writeFileSync(path.join(outputDir, filename), file.buffer);
    const record = await this.mediaService.create(req.user.id, {
      type: file.mimetype.startsWith('video') ? 'video' : 'image',
      url: `/static/${filename}`,
      original_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
    });
    return { id: record.id, url: `/static/${filename}`, original_name: file.originalname };
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
