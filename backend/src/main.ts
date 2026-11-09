import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Trust nginx proxy headers so req.ip reflects the real client IP
  app.set('trust proxy', 1);

  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176')
    .split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Serve generated video/image files as static assets
  const outputDir = join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  app.useStaticAssets(outputDir, {
    prefix: '/static/',
    setHeaders: (res: any, filePath: string) => {
      if (filePath.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
      }
      if (filePath.match(/\.(mp3|wav|m4a|flac|ogg)$/i)) {
        res.setHeader('Accept-Ranges', 'bytes');
        if (filePath.endsWith('.mp3')) res.setHeader('Content-Type', 'audio/mpeg');
        else if (filePath.endsWith('.wav')) res.setHeader('Content-Type', 'audio/wav');
        else if (filePath.endsWith('.m4a')) res.setHeader('Content-Type', 'audio/mp4');
        else if (filePath.endsWith('.flac')) res.setHeader('Content-Type', 'audio/flac');
        else if (filePath.endsWith('.ogg')) res.setHeader('Content-Type', 'audio/ogg');
      }
    },
  });

  const port = process.env.PORT ?? 3000;

  // 进程级兜底（2026-11-09 风险审查 P0-2）：Node 22 默认 unhandledRejection=throw，
  // 任何漏 catch 的 Promise 都会杀进程。这里只记日志：
  // - unhandledRejection：只记录，不退出（保持服务可用）
  // - uncaughtException：记录后退出，交给 pm2 重启（状态已不可信）
  const bootLog = app.get(WINSTON_MODULE_NEST_PROVIDER);
  process.on('unhandledRejection', (reason: any) => {
    bootLog.error(`[unhandledRejection] ${reason?.stack || reason}`);
  });
  process.on('uncaughtException', (err: Error) => {
    bootLog.error(`[uncaughtException] ${err.stack || err.message}`);
    process.exit(1);
  });

  // 开关机钩子：pm2 restart / SIGTERM 会触发各 service 的 onModuleDestroy，及时停掉
  // 心跳定时器、@Interval 定时任务与 Redis 连接，避免停机瞬间还在写库。
  // 注意：关机路径**不**做任务结清（来不及、且容易写半截）；进程重启遗留的 processing
  // 任务由下次启动的 TaskRecoveryService 自愈（心跳停摆 90s 判孤儿 → 失败 + 全额退款）。
  app.enableShutdownHooks();
  await app.listen(port);
}
bootstrap();
