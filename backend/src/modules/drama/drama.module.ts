import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DramaProject } from './drama-project.entity';
import { DramaOutline } from './drama-outline.entity';
import { DramaEpisode } from './drama-episode.entity';
import { DramaSegment } from './drama-segment.entity';
import { DramaAsset } from './drama-asset.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { DramaService } from './drama.service';
import { DramaController } from './drama.controller';
import { UtilsModule } from '../../utils/utils.module';
import { PromptTemplateService } from '../admin/prompt-template.service';
import { PromptTemplate } from '../admin/prompt-template.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DramaProject, DramaOutline, DramaEpisode, DramaSegment, DramaAsset, GlobalAsset, PromptTemplate]),
    BullModule.registerQueue({ name: 'drama-segment' }),
    UtilsModule,
  ],
  controllers: [DramaController],
  providers: [DramaService, PromptTemplateService],
  exports: [DramaService, BullModule],
})
export class DramaModule {}
