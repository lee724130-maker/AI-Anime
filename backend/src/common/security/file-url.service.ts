import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 静态文件签名（2026-11-23 越权修复 A 方案）
 *
 * 背景：`main.ts` 用 `useStaticAssets(outputDir, { prefix: '/static/' })` 直出产物目录，
 * 挂在 Nest 守卫之外 —— 实测（本地与生产均验证）任何人**不带任何凭证**即可用
 * `GET /static/img_<自增任务id>_<视角>_<毫秒>.png` 取走他人图片/视频/音频。
 * 文件名里的数字就是自增任务 id，可枚举，唯一未知量是 13 位毫秒时间戳，
 * 而这个时间戳会随属主自己的接口响应、作品展、日志、Referer 等外泄。
 *
 * 方案：库里仍只存干净相对路径（`/static/x.png`），**出站响应统一由拦截器签成**
 * `/static/x.png?exp=<秒级过期>&sig=<HMAC>`；入站由归一化中间件把签名剥掉再落库。
 * `/static` 前置守卫只认签名（或管理员 Bearer），因此：
 *  - 未登录 / 猜文件名 → 403；
 *  - 链接泄露 → 过期即失效；
 *  - 前端 `<img>/<video>` 零改动（拿到的就是带 query 的 URL）。
 *
 * 签名对象是**解码后的路径**（去掉 `/static/` 前缀），避免中文名的百分号编码差异导致校验抖动。
 */
export const STATIC_URL_TTL_SEC = 6 * 3600; // 6 小时：够一次创作会话，又能限制链接外泄

@Injectable()
export class FileUrlService {
  private readonly logger = new Logger(FileUrlService.name);
  private readonly secret: string;

  constructor() {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error('JWT_SECRET 未配置，无法为静态 URL 签名');
    this.secret = s;
  }

  /** `/static/a.png` → `/static/a.png?exp=..&sig=..`（已带签名则原样返回） */
  sign(url: string, ttlSec: number = STATIC_URL_TTL_SEC): string {
    const parsed = this.split(url);
    if (!parsed) return url;
    if (parsed.query.has('sig')) return url; // 幂等：不重复签
    const exp = Math.floor(Date.now() / 1000) + ttlSec;
    const sig = this.hmac(parsed.key, exp);
    const q = new URLSearchParams(parsed.query);
    q.set('exp', String(exp));
    q.set('sig', sig);
    return `/static/${parsed.key}?${q.toString()}`;
  }

  /** 校验：路径 + exp + sig 三者一致且未过期 */
  verify(rawPath: string, exp: unknown, sig: unknown): boolean {
    const key = this.normalize(rawPath);
    if (!key) return false;
    const e = Number(exp);
    if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
    const s = typeof sig === 'string' ? sig : '';
    if (!/^[0-9a-f]{64}$/.test(s)) return false;
    const expect = this.hmac(key, e);
    try {
      return timingSafeEqual(Buffer.from(expect, 'hex'), Buffer.from(s, 'hex'));
    } catch {
      return false;
    }
  }

  /** 入站剥签名：`/static/x.png?exp=..&sig=..` → `/static/x.png`（用于落库前归一化） */
  strip(url: string): string {
    const parsed = this.split(url);
    if (!parsed) return url;
    if (!parsed.query.has('sig') && !parsed.query.has('exp')) return url;
    const keep = new URLSearchParams();
    for (const [k, v] of parsed.query) if (k !== 'sig' && k !== 'exp') keep.set(k, v);
    const qs = keep.toString();
    return `/static/${parsed.key}${qs ? '?' + qs : ''}`;
  }

  isStaticRef(v: unknown): v is string {
    return typeof v === 'string' && v.startsWith('/static/');
  }

  /** 由 `/static/<name>` 取出去前缀后的规范 key（供 video/file 这类只给文件名的场景复用） */
  keyOf(urlOrName: string): string {
    const parsed = this.split(urlOrName);
    if (parsed) return parsed.key;
    return String(urlOrName || '').replace(/^\/?static\//, '').split('?')[0];
  }

  private hmac(key: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${key}|${exp}`).digest('hex');
  }

  private split(url: string): { key: string; query: URLSearchParams } | null {
    if (typeof url !== 'string') return null;
    let decoded = url;
    try { decoded = decodeURIComponent(url); } catch { /* 已是明文路径 */ }
    const bare = decoded.split('?')[0];
    if (!bare.startsWith('/static/')) return null;
    const key = this.normalize(bare);
    if (!key) return null;
    const qs = decoded.slice(bare.length).replace(/^\?/, '');
    return { key, query: new URLSearchParams(qs) };
  }

  /** 统一成不带前导 /static/、不含 query、无路径穿越风险的 key */
  private normalize(rawPath: string): string | null {
    if (typeof rawPath !== 'string') return null;
    let p = rawPath;
    try { p = decodeURIComponent(p); } catch { /* ignore */ }
    p = p.split('?')[0];
    if (!p.startsWith('/static/')) return null;
    const key = p.slice('/static/'.length);
    if (!key || key.includes('\0') || key.includes('..')) return null;
    return key;
  }
}
