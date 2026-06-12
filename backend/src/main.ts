import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'], credentials: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Serve generated video/image files as static assets
  const outputDir = join(process.cwd(), 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  app.useStaticAssets(outputDir, {
    prefix: '/static/',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
      }
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Static files served from: ${outputDir}`);
}
bootstrap();
