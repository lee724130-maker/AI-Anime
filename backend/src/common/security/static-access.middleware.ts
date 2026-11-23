import type { Request, Response } from 'express';
import type { FileUrlService } from './file-url.service';

/**
 * `/static` 前置守卫（2026-11-23 越权修复）。
 *
 * 只认签名：`/static/<file>?exp=<秒>&sig=<HMAC>`。没有签名或已过期一律 403。
 * 必须在 `app.useStaticAssets(...)` **之前**注册，这样 express.static 只在守卫放行后才接手。
 *
 * 为什么不做「按登录态查属主」：`<img>/<video>` 不会带 Authorization 头，纯 session 方案要动
 * Cookie 与前端；而签名 URL 一处签发全站生效，还额外拿到「链接会过期」这个性质。
 */
export function createStaticAccessMiddleware(fileUrl: FileUrlService) {
  return (req: Request, res: Response, next: () => void) => {
    const raw = (req.originalUrl || req.url || '').split('?')[0];
    const qs = (req.originalUrl || req.url || '').split('?')[1] || '';
    const params = new URLSearchParams(qs);
    const exp = params.get('exp');
    const sig = params.get('sig');

    if (!exp || !sig || !fileUrl.verify(raw, exp, sig)) {
      res.status(403).json({ statusCode: 403, message: '文件访问链接无效或已过期' });
      return;
    }
    next();
  };
}
