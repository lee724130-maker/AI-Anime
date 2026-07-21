import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { VideoTask } from './video.entity';
import { User } from '../user/user.entity';
import { SystemConfig } from '../admin/admin.entity';
import { Script } from '../script/script.entity';
import { Character } from '../character/character.entity';
import { VideoService } from './video.service';
import { VideoController } from './video.controller';
import { UtilsModule } from '../../utils/utils.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoTask, User, SystemConfig, Script, Character]),
    BullModule.registerQueue({ name: 'video' }),
    UtilsModule,
  ],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
