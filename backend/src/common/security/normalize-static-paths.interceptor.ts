import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { FileUrlService } from './file-url.service';

/**
 * 入站归一化拦截器：把请求里带回来的 `/static/x.png?exp=..&sig=..` 剥成 `/static/x.png`。
 *
 * 为什么必须有：响应被 SignStaticUrlsInterceptor 签过名之后，前端拿到的 URL 带 query。
 * 本项目的写接口里有不少是「把刚读到的 URL 原样存回去」，例如
 *   - 漫画工作室设定本 `PUT :id/sheets/block-reference`（referenceImage 来自资产列表响应）
 *   - 短剧资产上传后回填、画布/剪辑时间线保存节点 url、热门模板变量里的参考图 url
 * 不归一化的话，**带 6 小时有效期的签名会被写进数据库**，过期后历史素材集体打不开。
 * 这里在进 handler 之前统一剥签名，库里永远只存干净相对路径。
 */
const MAX_DEPTH = 12;

@Injectable()
export class NormalizeStaticPathsInterceptor implements NestInterceptor {
  constructor(private readonly fileUrl: FileUrlService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    if (req) {
      if (req.body && typeof req.body === 'object') req.body = this.walk(req.body, 0, new WeakSet());
      if (req.query && typeof req.query === 'object') this.mutateInPlace(req.query);
      if (Array.isArray(req.params)) req.params = this.walk(req.params, 0, new WeakSet());
    }
    return next.handle();
  }

  private mutateInPlace(obj: Record<string, any>) {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === 'string') obj[k] = this.clean(v);
      else if (v && typeof v === 'object') obj[k] = this.walk(v, 1, new WeakSet());
    }
  }

  private walk(value: any, depth: number, seen: WeakSet<object>): any {
    if (depth > MAX_DEPTH || value == null) return value;
    if (typeof value === 'string') return this.clean(value);
    if (typeof value !== 'object') return value;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Date) return value;
    if (seen.has(value)) return value;
    seen.add(value);
    if (Array.isArray(value)) return value.map((v) => this.walk(v, depth + 1, seen));
    // 与出站拦截器同理：不能因为是自己写的普通对象就跳过类实例，req.body 一般是普通对象，
    // 但某些 pipe transform 后会带类实例（DTO 实例），一律按自身可枚举属性处理。
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = this.walk(v, depth + 1, seen);
    return out;
  }

  private clean(s: string): string {
    if (!s.includes('/static/')) return s;
    const t = s.trim();
    const looksJson = (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
    if (looksJson) {
      try {
        return JSON.stringify(this.walk(JSON.parse(t), 2, new WeakSet()));
      } catch { /* 非 JSON，走普通字符串 */ }
    }
    if (t.startsWith('/static/')) return this.fileUrl.strip(t);
    return s;
  }
}
