import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import * as path from 'path';
import { User } from './modules/user/user.entity';
import { Script } from './modules/script/script.entity';
import { Character } from './modules/character/character.entity';
import { SystemConfig } from './modules/admin/admin.entity';
import { AdminLog } from './modules/admin/admin-log.entity';
import { ModelConfig } from './modules/admin/model-config.entity';
import { AdminNotification } from './modules/admin/admin-notification.entity';
import { PromptTemplate } from './modules/admin/prompt-template.entity';
import { VideoTask } from './modules/video/video.entity';
import { Order } from './modules/order/order.entity';
import { DramaProject } from './modules/drama/drama-project.entity';
import { DramaOutline } from './modules/drama/drama-outline.entity';
import { DramaEpisode } from './modules/drama/drama-episode.entity';
import { DramaSegment } from './modules/drama/drama-segment.entity';
import { DramaAsset } from './modules/drama/drama-asset.entity';
import { GlobalAsset } from './modules/global-asset/global-asset.entity';
import { ViralTemplate } from './modules/viral/viral-template.entity';
import { ViralProject } from './modules/viral/viral-project.entity';
import { MediaFile } from './modules/media/media-file.entity';
import { GenerationTask } from './modules/task/generation-task.entity';
import { TaskEvent } from './modules/task/task-event.entity';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ScriptModule } from './modules/script/script.module';
import { CharacterModule } from './modules/character/character.module';
import { AdminModule } from './modules/admin/admin.module';
import { VideoModule } from './modules/video/video.module';
import { OrderModule } from './modules/order/order.module';
import { QueueModule } from './queues/queue.module';
import { DramaModule } from './modules/drama/drama.module';
import { MediaModule } from './modules/media/media.module';
import { TaskModule } from './modules/task/task.module';
import { GenerateModule } from './modules/generate/generate.module';
import { GlobalAssetModule } from './modules/global-asset/global-asset.module';
import { ViralModule } from './modules/viral/viral.module';
import { WorkbenchModule } from './modules/workbench/workbench.module';
import { RolesGuard } from './common/guards/roles.guard';

const logDir = path.resolve(process.cwd(), 'logs');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    WinstonModule.forRoot({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack, context }) => {
          return `${timestamp} [${level}]${context ? ' [' + context + ']' : ''} ${message}${stack ? '\n' + stack : ''}`;
        }),
      ),
      transports: [
        new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.printf(({ timestamp, level, message, stack, context }) => {
          return `${timestamp} [${level}]${context ? ' [' + context + ']' : ''} ${message}${stack ? '\n' + stack : ''}`;
        })) }),
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error', maxFiles: 7, maxsize: 10485760 }),
        new winston.transports.File({ filename: path.join(logDir, 'combined.log'), maxFiles: 7, maxsize: 10485760 }),
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const type = config.get<'mysql' | 'sqlite'>('DB_TYPE', 'sqlite');
        if (type === 'mysql') {
          return {
            type: 'mysql',
            host: config.get('DB_HOST', 'localhost'),
            port: config.get<number>('DB_PORT', 3306),
            username: config.get('DB_USER', 'root'),
            password: config.get('DB_PASSWORD', ''),
            database: config.get('DB_NAME', 'ai_anime'),
            charset: 'utf8mb4',
            extra: {
              charset: 'utf8mb4',
            },
entities: [User, Script, Character, SystemConfig, AdminLog, ModelConfig, AdminNotification, PromptTemplate, VideoTask, Order, DramaProject, DramaOutline, DramaEpisode, DramaSegment, DramaAsset, GlobalAsset, ViralTemplate, ViralProject, MediaFile, GenerationTask, TaskEvent],
            synchronize: true,
          };
        }
        return {
          type: 'better-sqlite3',
          database: config.get('DB_PATH', './data/dev.db'),
          entities: [User, Script, Character, SystemConfig, AdminLog, ModelConfig, AdminNotification, PromptTemplate, VideoTask, Order, DramaProject, DramaOutline, DramaEpisode, DramaSegment, DramaAsset, GlobalAsset, ViralTemplate, ViralProject, MediaFile, GenerationTask, TaskEvent],
          synchronize: true,
        };
      },
    }),
    AuthModule,
    UserModule,
    ScriptModule,
    CharacterModule,
    AdminModule,
    VideoModule,
    OrderModule,
    QueueModule,
    DramaModule,
    MediaModule,
    TaskModule,
    GenerateModule,
    GlobalAssetModule,
    ViralModule,
    WorkbenchModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
