import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FileUrlService } from './file-url.service';
import { FileOwnershipService } from './file-ownership.service';
import { SignStaticUrlsInterceptor } from './sign-static-urls.interceptor';
import { NormalizeStaticPathsInterceptor } from './normalize-static-paths.interceptor';

/**
 * 文件访问安全模块（2026-11-23 越权修复）。
 * 放在 AppModule imports 的**最后**，确保 ConfigModule 的 dotenv 已把 JWT_SECRET 灌进 process.env。
 * 标 @Global：/static 签名与归属校验是横切关注点，video/editor/drama/comic 等模块都要注入，
 * 逐模块 import 容易漏，漏了就变成启动期 DI 报错。
 */
@Global()
@Module({
  providers: [
    FileUrlService,
    FileOwnershipService,
    { provide: APP_INTERCEPTOR, useClass: NormalizeStaticPathsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SignStaticUrlsInterceptor },
  ],
  exports: [FileUrlService, FileOwnershipService],
})
export class FileSecurityModule {}
