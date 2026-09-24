import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { createClient } from 'redis';

const REGISTER_DAILY_LIMIT = 2;

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private redisClient: any = null;

  private async redis(): Promise<any> {
    if (this.redisClient) return this.redisClient;
    try {
      const client = createClient({
        url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}/${process.env.REDIS_DB || 0}`,
        ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
      });
      client.on('error', () => { /* suppress connection noise */ });
      await client.connect();
      this.redisClient = client;
    } catch {
      this.redisClient = null;
      this.logger.warn('Redis 不可用，访问统计/封禁/注册限制功能降级');
    }
    return this.redisClient;
  }

  getIp(req: any): string {
    const xff = req.headers?.['x-forwarded-for'];
    if (xff) {
      const first = String(xff).split(',')[0].trim();
      if (first) return first;
    }
    const real = req.headers?.['x-real-ip'];
    if (real) return String(real).trim();
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private isLocal(ip: string): boolean {
    // 仅豁免回环地址；10./192.168. 等内网段不豁免——否则伪造 XFF 头即可绕过封禁与注册限流
    return !ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }

  async isBanned(req: any): Promise<boolean> {
    const ip = this.getIp(req);
    if (this.isLocal(ip)) return false;
    const redis = await this.redis();
    if (!redis) return false;
    try {
      const raw = await redis.sIsMember('banned_ips', ip);
      return raw === true || raw === 1;
    } catch (e: any) {
      this.logger.warn(`封禁检查失败: ${e.message}`);
      return false;
    }
  }

  async track(req: any): Promise<void> {
    try {
      const url: string = req.originalUrl || req.url || '';
      if (!url.startsWith('/api/')) return;
      if (url.startsWith('/api/auth/send-code')) return;
      const ip = this.getIp(req);
      const redis = await this.redis();
      if (!redis) return;
      const date = new Date().toISOString().slice(0, 10);
      await redis.incr(`access_count:${date}`);
      await redis.expire(`access_count:${date}`, 7 * 86400);
      await redis.hIncrBy(`access_ips:${date}`, ip, 1);
      await redis.expire(`access_ips:${date}`, 7 * 86400);
      await redis.hSet(`access_last:${date}`, ip, String(Date.now()));
      await redis.expire(`access_last:${date}`, 7 * 86400);
    } catch { /* tracking must never break business */ }
  }

  /** Throws if this IP has registered too many accounts today */
  async checkRegisterLimit(ip: string): Promise<void> {
    if (this.isLocal(ip)) return;
    const redis = await this.redis();
    if (!redis) return;
    const date = new Date().toISOString().slice(0, 10);
    const key = `reg_ip:${date}:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 86400);
    if (count > REGISTER_DAILY_LIMIT) {
      throw new BadRequestException('今日该网络注册账号已达上限，请明天再试');
    }
  }

  async getSummary() {
    const date = new Date().toISOString().slice(0, 10);
    const redis = await this.redis();
    if (!redis) return { today_visits: 0, today_ips: 0, ips: [], banned: [] };
    const todayCount = Number(await redis.get(`access_count:${date}`)) || 0;
    const counts: Record<string, string> = await redis.hGetAll(`access_ips:${date}`);
    const last: Record<string, string> = await redis.hGetAll(`access_last:${date}`);
    const banned: string[] = await redis.sMembers('banned_ips');
    const ips = Object.entries(counts || {})
      .map(([ip, cnt]) => ({
        ip,
        count: Number(cnt),
        last_at: Number(last?.[ip] || 0),
        banned: banned.includes(ip),
      }))
      .sort((a, b) => b.count - a.count || b.last_at - a.last_at);
    return { today_visits: todayCount, today_ips: ips.length, ips, banned };
  }

  async ban(ip: string) {
    if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) throw new BadRequestException('IP 格式无效');
    if (ip.startsWith('127.')) {
      throw new BadRequestException('不能封禁本地回环地址');
    }
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => p < 0 || p > 255)) throw new BadRequestException('IP 格式无效');
    const redis = await this.redis();
    if (!redis) throw new BadRequestException('Redis 不可用');
    await redis.sAdd('banned_ips', ip);
    this.logger.warn(`IP 已封禁: ${ip}`);
    return { banned: true, ip };
  }

  async unban(ip: string) {
    const redis = await this.redis();
    if (!redis) throw new BadRequestException('Redis 不可用');
    await redis.sRem('banned_ips', ip);
    this.logger.log(`IP 已解封: ${ip}`);
    return { banned: false, ip };
  }
}
