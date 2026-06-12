import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { VideoProcessor } from './video.processor';
import { VideoModule } from '../modules/video/video.module';
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
    TypeOrmModule.forFeature([Character, Script]),
    VideoModule,
    UtilsModule,
  ],
  providers: [VideoProcessor],
  exports: [BullModule],
})
export class QueueModule {}
