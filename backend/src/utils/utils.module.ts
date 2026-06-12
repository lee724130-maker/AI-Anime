import { Module } from '@nestjs/common';
import { AIServiceUtil } from './ai-service.util';
import { FFmpegUtil } from './ffmpeg.util';
import { AdminModule } from '../modules/admin/admin.module';

@Module({
  imports: [AdminModule],
  providers: [AIServiceUtil, FFmpegUtil],
  exports: [AIServiceUtil, FFmpegUtil],
})
export class UtilsModule {}
