import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Script } from './script.entity';
import { VideoTask } from '../video/video.entity';
import { ScriptService } from './script.service';
import { ScriptController } from './script.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Script, VideoTask])],
  controllers: [ScriptController],
  providers: [ScriptService],
  exports: [ScriptService],
})
export class ScriptModule {}
