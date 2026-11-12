import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';
import { randomUUID } from 'crypto';

/** 只释放「自己刚拿到的那把锁」：token 不匹配就不动，避免误删别的实例续期的锁 */
const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * 定时任务分布式锁 —— 为「后端从单 pm2 进程扩到多实例/独立 worker」铺路。
 *
 * 语义约定（很重要，别改）：
 * 1. 抢不到锁 = 别的实例已经在跑这一轮 → 本轮直接跳过。前提是这些任务都是幂等的
 *    （清理/订单过期/额度刷新/孤儿任务回收，谁跑结果都一样），所以「跳过」比「等待」正确。
 * 2. Redis 不可用时降级为「照常执行」，绝不让定时任务因为 Redis 抖动而停摆
 *    （本地开发、Redis 挂掉的单机场景都必须继续转）。
 * 3. TTL 必须大于任务最长耗时，否则锁先到期、第二个实例进来，就变成双跑。
 * 4. 同进程重叠也挡：上一轮还没跑完时本轮直接跳过（@Interval 不等待 async handler 完成）。
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private client: any = null;
  private connecting: Promise<any> | null = null;
  /** 本进程身份标识，锁值用它，释放时校验 */
  private readonly token = randomUUID();
  /** 本进程正在执行的任务名，防同进程重叠执行 */
  private readonly localRunning = new Set<string>();

  private async redis(): Promise<any | null> {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        const client = createClient({
          url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}/${process.env.REDIS_DB || 0}`,
          ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        });
        client.on('error', () => { /* 连接噪声不外泄，与 auth.service 同款处理 */ });
        await client.connect();
        this.client = client;
        this.logger.log('Redis 已连接（定时任务分布式锁）');
      } catch {
        this.client = null;
        this.logger.warn('Redis 不可用，定时任务降级为本机独占执行');
      }
      return this.client;
    })();
    const c = await this.connecting;
    this.connecting = null;
    return c;
  }

  /**
   * 拿锁执行一个定时任务轮次。
   * @returns true = 本轮真的跑了；false = 被别的实例或上一轮占着，本轮跳过
   */
  async runExclusive(name: string, ttlSeconds: number, fn: () => Promise<void>): Promise<boolean> {
    if (this.localRunning.has(name)) {
      this.logger.debug(`[lock] ${name} 上一轮仍未结束，本轮跳过`);
      return false;
    }
    this.localRunning.add(name);

    const key = `lock:cron:${name}`;
    const redis = await this.redis();
    let heldLocally = false;
    try {
      if (redis) {
        let ok: any = null;
        try {
          ok = await redis.set(key, this.token, { NX: true, EX: ttlSeconds });
        } catch (err: any) {
          // Redis 中途报错（断连/超时）→ 降级本地执行，不让定时停摆
          this.logger.warn(`[lock] ${name} 加锁失败，本轮降级本机执行: ${err.message}`);
          heldLocally = true;
        }
        if (!ok && !heldLocally) {
          this.logger.debug(`[lock] ${name} 锁被其他实例持有，本轮跳过`);
          return false;
        }
      } else {
        heldLocally = true;
      }
      await fn();
      return true;
    } catch (err: any) {
      this.logger.error(`[lock] ${name} 执行异常: ${err.message}`);
      return false;
    } finally {
      this.localRunning.delete(name);
      if (redis && !heldLocally) {
        try {
          await redis.eval(RELEASE_LUA, { keys: [key], arguments: [this.token] });
        } catch { /* 释放失败无所谓，TTL 会兜底 */ }
      }
    }
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }
}
