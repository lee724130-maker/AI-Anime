import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
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
import { DramaSegmentCandidate } from './modules/drama/drama-segment-candidate.entity';
import { DramaAsset } from './modules/drama/drama-asset.entity';
import { GlobalAsset } from './modules/global-asset/global-asset.entity';
import { ViralTemplate } from './modules/viral/viral-template.entity';
import { ViralProject } from './modules/viral/viral-project.entity';
import { CanvasProject } from './modules/canvas/canvas-project.entity';
import { CanvasTemplate } from './modules/canvas/canvas-template.entity';
import { EditorProject } from './modules/editor/editor-project.entity';
import { MediaFile } from './modules/media/media-file.entity';
import { GenerationTask } from './modules/task/generation-task.entity';
import { TaskEvent } from './modules/task/task-event.entity';
import { ShowcaseWork } from './modules/workbench/showcase-work.entity';
import { Activity } from './modules/workbench/activity.entity';
import { FeatureRelease } from './modules/workbench/feature-release.entity';
import { UserTaskClaim } from './modules/workbench/user-task-claim.entity';
import { ComicProject } from './modules/comic-studio/comic-project.entity';
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
import { CanvasModule } from './modules/canvas/canvas.module';
import { EditorModule } from './modules/editor/editor.module';
import { WorkbenchModule } from './modules/workbench/workbench.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { SecurityModule } from './modules/security/security.module';
import { SecurityMiddleware } from './modules/security/security.middleware';
import { PaymentModule } from './modules/payment/payment.module';
import { ContactModule } from './modules/contact/contact.module';
import { RolesGuard } from './common/guards/roles.guard';
import { CommonModule } from './common/services/common.module';
import { ComicStudioModule } from './modules/comic-studio/comic-studio.module';

const logDir = path.resolve(process.cwd(), 'logs');

/** 实体清单（原来在 mysql / sqlite 两个分支里各抄一遍，容易漂移，统一上提） */
const entities = [
  User, Script, Character, SystemConfig, AdminLog, ModelConfig, AdminNotification, PromptTemplate,
  VideoTask, Order, DramaProject, DramaOutline, DramaEpisode, DramaSegment, DramaSegmentCandidate,
  DramaAsset, GlobalAsset, ViralTemplate, ViralProject, CanvasProject, CanvasTemplate, EditorProject,
  MediaFile, GenerationTask, TaskEvent, ShowcaseWork, Activity, FeatureRelease, UserTaskClaim,
  ComicProject,
];

/**
 * 日志格式：抽出来给 Console 与文件两个 transport 复用（原来两处 printf 各写一遍）。
 * 输出样式与改造前保持一致，方便既有 grep 习惯和验证脚本继续用。
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, context }) => {
    return `${timestamp} [${level}]${context ? ' [' + context + ']' : ''} ${message}${stack ? '\n' + stack : ''}`;
  }),
);

/**
 * 文件日志轮转（2026-10-29 P0 修复）。
 * 原写法 `new winston.transports.File({ maxsize, maxFiles })` 里这两个参数 File transport
 * 根本不支持（winston 官方把按大小/份数轮转放在 daily-rotate-file 包里），所以日志其实是
 * 无限增长的——生产是 1.6G 内存的小机器，磁盘写满就是全站故障。
 * 现在：按天切文件 + 单文件 20MB 上限 + 保留 14 天，目录仍是 logs/，文件名带日期。
 */
const fileTransport = (base: string, level?: string) => new winston.transports.DailyRotateFile({
  dirname: logDir,
  filename: `${base}-%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  level,
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: false,
});

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    // 定时任务统一由 ScheduleModule 托管（替代散落各模块的裸 setInterval，见各 service 注释）
    ScheduleModule.forRoot(),
    CommonModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    WinstonModule.forRoot({
      level: 'info',
      format: logFormat,
      transports: [
        new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), logFormat) }),
        fileTransport('error', 'error'),
        fileTransport('combined'),
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const type = config.get<'mysql' | 'sqlite'>('DB_TYPE', 'sqlite');
        /**
         * 表结构管理开关（2026-10-29 P0）。
         * 之前 synchronize 在两个分支里都硬编码 true：TypeORM 每次启动按实体反向改表，
         * 而它会**删掉实体类里没有的列**（09-22 已记录过该行为），一次误发布就可能吃掉线上数据。
         * 默认值仍取 '1'，本地开发手感零变化；生产在 .env 与 .env.local 里显式写
         * DB_SYNCHRONIZE=0（两份都要写，.env.local 优先），改由 src/migrations 迁移文件管结构。
         */
        const synchronize = config.get('DB_SYNCHRONIZE', '1') === '1';
        const shared = {
          entities,
          synchronize,
          migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
          // 关 synchronize 后，新环境靠启动时自动跑迁移建表（本地保持 false，行为不变）
          migrationsRun: config.get('DB_MIGRATIONS_RUN', '0') === '1',
          migrationsTableName: 'typeorm_migrations',
        };
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
            ...shared,
          };
        }
        return {
          type: 'better-sqlite3',
          database: config.get('DB_PATH', './data/dev.db'),
          ...shared,
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
    CanvasModule,
    EditorModule,
    WorkbenchModule,
    CleanupModule,
    SecurityModule,
    PaymentModule,
    ContactModule,
    ComicStudioModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
