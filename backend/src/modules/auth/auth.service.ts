import { Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
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
// 超级管理员二次验证固定发到该绑定邮箱（与生产一致）
const SUPER_ADMIN_EMAIL = '1012453931@qq.com';

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
  ) {
    // 定期清理过期的内存验证码缓存（与生产一致，每 5 分钟一次）
    setInterval(() => {
      const now = Date.now();
      for (const [key, val] of this.codeStore.codes) {
        if (now - val.expiresAt > 600000) this.codeStore.codes.delete(key);
      }
      for (const [key, val] of this.codeStore.sentAt) {
        if (now - val > 86400000) this.codeStore.sentAt.delete(key);
      }
      for (const [key, val] of this.codeStore.daily) {
        if (now - new Date(`${val.day}T00:00:00Z`).getTime() > 86400000) this.codeStore.daily.delete(key);
      }
    }, 300000);
  }

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
    // 与生产一致：主查询取全实体（含 is_super_admin），password 因 select:false 单独查
    const user = await this.userRepo.createQueryBuilder('u')
      .where('u.username = :username OR u.email = :username', { username: dto.username })
      .getOne();
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const pwRow = await this.userRepo.createQueryBuilder('u')
      .select('u.id', 'id')
      .addSelect('u.password', 'password')
      .where('u.username = :username OR u.email = :username', { username: dto.username })
      .getRawOne();
    if (!pwRow) throw new UnauthorizedException('用户名或密码错误');

    const valid = await bcrypt.compare(dto.password, pwRow.password);
    if (!valid) throw new UnauthorizedException('用户名或密码错误');
    if (user.status === 0) throw new ForbiddenException('账号已被封禁，无法登录');
    // 超级管理员登录需二次验证：返回 5 分钟有效的临时令牌，不直接发正式 token。
    // 前台站点登录带 skipVerification=true 跳过验证（仅用户名+密码）；管理后台不传，保持 2FA。
    if (user.is_super_admin && !dto.skipVerification) {
      // 新一次登录开始：作废该邮箱残留的旧验证码（Redis+内存双份）并清除 60s 限频，
      // 保证上一次登录用过的验证码不能跨会话复用，且可立即重新发送新码
      const codeKey = `admin:${SUPER_ADMIN_EMAIL}`;
      await this.removeCode(codeKey);
      this.codeStore.sentAt.delete(codeKey);
      const tempToken = this.jwtService.sign({ sub: user.id, type: 'super_admin_verify' }, { expiresIn: '5m' });
      return { requiresVerification: true, tempToken, user: { id: user.id, username: user.username, email: SUPER_ADMIN_EMAIL, is_super_admin: true } };
    }
    return this.buildToken(user);
  }

  /** 发送超级管理员二次验证邮件验证码（绑定邮箱，60s 限频） */
  async sendSuperAdminVerifyCode(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.is_super_admin) throw new BadRequestException('无权操作');
    const email = SUPER_ADMIN_EMAIL;
    const now = Date.now();
    const lastSent = this.codeStore.sentAt.get(`admin:${email}`) || 0;
    if (now - lastSent < RESEND_INTERVAL_MS) {
      throw new BadRequestException('发送太频繁，请 60 秒后再试');
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = now + CODE_TTL_MS;
    await this.persistCode(`admin:${email}`, code, expiresAt);
    try {
      await this.sendVerifyEmail(email, code);
    } catch (err: any) {
      this.logger.error(`超级管理员验证码发送失败: ${err.message}`);
      throw new BadRequestException('验证码发送失败，请稍后重试');
    }
    this.codeStore.sentAt.set(`admin:${email}`, now);
    this.logger.log(`超级管理员验证码已发送至 ${email}`);
    return { sent: true, message: '验证码已发送至绑定邮箱' };
  }

  /** 校验超级管理员二次验证码，通过后签发正式 token */
  async verifySuperAdminCode(tempToken: string, code: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken);
    } catch {
      throw new UnauthorizedException('验证已过期，请重新登录');
    }
    if (payload.type !== 'super_admin_verify') {
      throw new BadRequestException('无效的验证令牌');
    }
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.is_super_admin) throw new UnauthorizedException('账号异常');
    const email = SUPER_ADMIN_EMAIL;
    const valid = await this.verifyCode(`admin:${email}`, code);
    if (!valid) throw new UnauthorizedException('验证码错误或已过期');
    this.logger.log(`超级管理员 ${user.username} 二次验证通过`);
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
            // 验证码是一次性的：必须同时删掉 Redis 与内存两份副本，
            // 否则 Redis 那份被删后校验会 fall through 到内存残留副本，旧码可复用
            await this.removeCode(email);
            return true;
          }
        }
      } catch { /* fall through to memory */ }
    }
    const stored = this.codeStore.codes.get(email);
    if (!stored || stored.code !== code || Date.now() > stored.expiresAt) return false;
    await this.removeCode(email);
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

  /** 超级管理员二次验证专用邮件（管理后台登录验证码） */
  private async sendVerifyEmail(to: string, code: string) {
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
      subject: '管理后台登录验证码',
      text: `您的管理后台登录验证码是：${code}，5 分钟内有效。若非本人操作，请立即检查账号安全。`,
      html: `<div style="font-family:sans-serif;padding:24px;max-width:420px;margin:0 auto;border:1px solid #eee;border-radius:12px">
  <h2 style="color:#7c3aed;margin:0 0 12px">AI 动漫短剧 · 安全验证</h2>
  <p style="color:#333;font-size:14px">超级管理员登录验证码：</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#7c3aed;margin:8px 0">${code}</p>
  <p style="color:#999;font-size:12px">验证码 5 分钟内有效，请勿泄露给他人。</p>
  <p style="color:#e74c3c;font-size:12px;margin-top:12px">⚠️ 若非本人操作，请立即检查账号安全。</p>
</div>`,
    });
  }

  private buildToken(user: User) {
    const payload = { sub: user.id, username: user.username, role: user.role, is_super_admin: user.is_super_admin };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        email: user.email,
        credits: user.credits,
        role: user.role,
        is_super_admin: user.is_super_admin,
        admin_permissions: user.admin_permissions,
        created_at: user.created_at,
      },
    };
  }
}
