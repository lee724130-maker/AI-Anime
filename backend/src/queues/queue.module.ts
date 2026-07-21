import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VideoProcessor } from './video.processor';
import { DramaSegmentProcessor } from './drama-segment.processor';
import { VideoModule } from '../modules/video/video.module';
import { DramaModule } from '../modules/drama/drama.module';
import { UtilsModule } from '../utils/utils.module';
import { Character } from '../modules/character/character.entity';
import { Script } from '../modules/script/script.entity';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD', '') || undefined,
          db: config.get<number>('REDIS_DB', 0),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'video' }),
    BullModule.registerQueue({ name: 'drama-segment' }),
    TypeOrmModule.forFeature([Character, Script]),
    VideoModule,
    DramaModule,
    UtilsModule,
  ],
  providers: [VideoProcessor, DramaSegmentProcessor],
  exports: [BullModule],
})
export class QueueModule {}
