import { Global, Module } from '@nestjs/common';
import { DistributedLockService } from './distributed-lock.service';

/**
 * 跨模块共用的基础服务。
 * 做成 @Global 是因为 cleanup / order / quota / 任务自愈这些定时任务分属不同模块，
 * 逐个 import 会把一个 60 行的工具类扩散成 4 处模块声明。
 */
@Global()
@Module({
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class CommonModule {}
