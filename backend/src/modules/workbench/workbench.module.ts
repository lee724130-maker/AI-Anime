import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DramaProject } from '../drama/drama-project.entity';
import { DramaEpisode } from '../drama/drama-episode.entity';
import { DramaSegment } from '../drama/drama-segment.entity';
import { DramaAsset } from '../drama/drama-asset.entity';
import { GlobalAsset } from '../global-asset/global-asset.entity';
import { GenerationTask } from '../task/generation-task.entity';
import { VideoTask } from '../video/video.entity';
import { ShowcaseWork } from './showcase-work.entity';
import { Activity } from './activity.entity';
import { FeatureRelease } from './feature-release.entity';
import { UserTaskClaim } from './user-task-claim.entity';
import { User } from '../user/user.entity';
import { WorkbenchController } from './workbench.controller';
import { WorkbenchService } from './workbench.service';
import { PromoService } from './promo.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DramaProject, DramaEpisode, DramaSegment, DramaAsset,
      GlobalAsset, GenerationTask, VideoTask, ShowcaseWork, User,
      Activity, FeatureRelease, UserTaskClaim,
    ]),
  ],
  controllers: [WorkbenchController],
  providers: [WorkbenchService, PromoService],
})
export class WorkbenchModule {}
