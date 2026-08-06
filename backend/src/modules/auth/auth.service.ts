import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { createClient } from 'redis';
import { User } from '../user/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_INTERVAL_MS = 60 * 1000; // 60s between sends
const DAILY_LIMIT = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly codeStore = {
    codes: new Map<string, { code: string; expiresAt: number }>(),
    sentAt: new Map<string, number>(),
    daily: new Map<string, { day: string; count: number }>(),
  };
  private redisClient: any = null;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    await this.checkRegisterIpLimit(ip);
    const existing = await this.userRepo.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });
    if (existing) {
      if (existing.username === dto.username) throw new ConflictException('用户名已被使用');
      throw new ConflictException('该邮箱已被注册');
    }

    const valid = await this.verifyCode(dto.email, dto.code);
    if (!valid) throw new ConflictException('验证码错误或已过期');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      username: dto.username,
      email: dto.email,
      password: hashed,
    });
    const saved = await this.userRepo.save(user);
    this.logger.log(`新用户注册: ${saved.username} (id=${saved.id}, email=${saved.email})`);

    return this.buildToken(saved);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: [{ username: dto.username }, { email: dto.username }],
      select: ['id', 'username', 'phone', 'email', 'credits', 'status', 'role', 'created_at', 'password'],
    });
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('用户名或密码错误');

    return this.buildToken(user);
  }

  async sendEmailCode(email: string) {
    const now = Date.now();
    const lastSent = this.codeStore.sentAt.get(email) || 0;
    if (now - lastSent < RESEND_INTERVAL_MS) {
      throw new BadRequestException('发送太频繁，请 60 秒后再试');
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    const daily = this.codeStore.daily.get(email);
    if (daily && daily.day === dayKey && daily.count >= DAILY_LIMIT) {
      throw new BadRequestException('今日发送次数已达上限，请明天再试');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = now + CODE_TTL_MS;
    await this.persistCode(email, code, expiresAt);

    try {
      await this.sendCodeEmail(email, code);
    } catch (err: any) {
      await this.removeCode(email);
      this.logger.error(`验证码邮件发送失败 (${email}): ${err.message}`);
      throw new BadRequestException('验证码邮件发送失败，请稍后重试');
    }

    // Record rate-limit state only after a successful send
    this.codeStore.sentAt.set(email, now);
    this.codeStore.daily.set(email, { day: dayKey, count: (daily?.day === dayKey ? daily.count : 0) + 1 });
    this.logger.log(`验证码已发送至 ${email}`);
    return { sent: true, message: '验证码已发送，请查收邮箱' };
  }

  private async persistCode(email: string, code: string, expiresAt: number) {
    this.codeStore.codes.set(email, { code, expiresAt });
    const redis = await this.redis();
    if (redis) {
      try {
        await redis.set(`email_code:${email}`, `${code}|${expiresAt}`, { EX: 300 });
      } catch { /* redis best-effort */ }
    }
  }

  private async removeCode(email: string) {
    this.codeStore.codes.delete(email);
    const redis = await this.redis();
    if (redis) {
      try { await redis.del(`email_code:${email}`); } catch { /* ignore */ }
    }
  }

  private async verifyCode(email: string, code: string): Promise<boolean> {
    const redis = await this.redis();
    if (redis) {
      try {
        const raw = await redis.get(`email_code:${email}`);
        if (raw) {
          const [savedCode, exp] = raw.split('|');
          if (savedCode === code && Number(exp) > Date.now()) {
            await redis.del(`email_code:${email}`);
            return true;
          }
        }
      } catch { /* fall through to memory */ }
    }
    const stored = this.codeStore.codes.get(email);
    if (!stored || stored.code !== code || Date.now() > stored.expiresAt) return false;
    this.codeStore.codes.delete(email);
    return true;
  }

  /** 同一 IP 每天最多注册 2 个账号，防止刷积分 */
  private async checkRegisterIpLimit(ip?: string): Promise<void> {
    if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) return;
    const redis = await this.redis();
    if (!redis) return;
    const date = new Date().toISOString().slice(0, 10);
    const key = `reg_ip:${date}:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 86400);
    if (count > 2) {
      throw new ConflictException('今日该网络注册账号已达上限，请明天再试');
    }
  }

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
      this.logger.log('Redis 已连接（验证码存储）');
    } catch {
      this.redisClient = null;
      this.logger.warn('Redis 不可用，验证码降级为内存存储');
    }
    return this.redisClient;
  }

  private async sendCodeEmail(to: string, code: string) {
    const host = process.env.SMTP_HOST || 'smtp.qq.com';
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) throw new Error('SMTP 未配置 (SMTP_USER/SMTP_PASS)');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"AI 动漫短剧" <${user}>`,
      to,
      subject: '注册验证码',
      text: `您的注册验证码是：${code}，5 分钟内有效。若非本人操作，请忽略本邮件。`,
      html: `<div style="font-family:sans-serif;padding:24px;max-width:420px;margin:0 auto;border:1px solid #eee;border-radius:12px">
  <h2 style="color:#7c3aed;margin:0 0 12px">AI 动漫短剧</h2>
  <p style="color:#333;font-size:14px">您的注册验证码是：</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#7c3aed;margin:8px 0">${code}</p>
  <p style="color:#999;font-size:12px">验证码 5 分钟内有效，请勿泄露给他人。</p>
</div>`,
    });
  }

  private buildToken(user: User) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        email: user.email,
        credits: user.credits,
        role: user.role,
        created_at: user.created_at,
      },
    };
  }
}
