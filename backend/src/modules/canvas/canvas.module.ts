import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanvasProject } from './canvas-project.entity';
import { CanvasTemplate } from './canvas-template.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { UtilsModule } from '../../utils/utils.module';

@Module({
  imports: [TypeOrmModule.forFeature([CanvasProject, CanvasTemplate]), UtilsModule],
  controllers: [CanvasController],
  providers: [CanvasService],
  exports: [CanvasService],
})
export class CanvasModule {}
