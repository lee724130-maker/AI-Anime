import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';
import { UtilsModule } from '../../utils/utils.module';
import { TaskModule } from '../task/task.module';
import { MediaModule } from '../media/media.module';
import { AdminModule } from '../admin/admin.module';
import { MediaFile } from '../media/media-file.entity';
import { GenerationTask } from '../task/generation-task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaFile, GenerationTask]),
    UtilsModule,
    TaskModule,
    MediaModule,
    AdminModule,
  ],
  controllers: [GenerateController],
  providers: [GenerateService],
  exports: [GenerateService],
})
export class GenerateModule {}
