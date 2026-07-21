import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Script } from './script.entity';
import { VideoTask } from '../video/video.entity';
import { ScriptService } from './script.service';
import { ScriptController } from './script.controller';
import { VideoModule } from '../video/video.module';
import { UtilsModule } from '../../utils/utils.module';
import { PromptTemplateService } from '../admin/prompt-template.service';
import { PromptTemplate } from '../admin/prompt-template.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Script, VideoTask, PromptTemplate]), VideoModule, UtilsModule],
  controllers: [ScriptController],
  providers: [ScriptService, PromptTemplateService],
  exports: [ScriptService],
})
export class ScriptModule {}
