import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditorProject } from './editor-project.entity';
import { SystemConfig } from '../admin/admin.entity';
import { EditorService } from './editor.service';
import { EditorController } from './editor.controller';
import { UtilsModule } from '../../utils/utils.module';
import { CanvasModule } from '../canvas/canvas.module';

@Module({
  imports: [TypeOrmModule.forFeature([EditorProject, SystemConfig]), UtilsModule, CanvasModule],
  controllers: [EditorController],
  providers: [EditorService],
})
export class EditorModule {}