import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { VideoTask } from './video.entity';
import { User } from '../user/user.entity';
import { SystemConfig } from '../admin/admin.entity';
import { VideoService } from './video.service';
import { VideoController } from './video.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoTask, User, SystemConfig]),
    BullModule.registerQueue({ name: 'video' }),
  ],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
