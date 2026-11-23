import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FileUrlService } from './file-url.service';

/**
 * 出站签名拦截器：把响应里所有 `/static/...` 路径换成带 `exp`+`sig` 的签名 URL。
 * 这样库里保持干净相对路径，前端与 `<img>/<video>` 零改动，而 `/static` 守卫只认签名。
 *
 * 注意点：
 *  - 本项目多个 JSON 列（如 `generation_tasks.output_data`）是**字符串里装 JSON**，
 *    所以除了纯字符串字段，还要能钻进 JSON 文本内部改写；解析失败就原样返回，绝不改坏数据。
 *  - Buffer / Stream / StreamableFile / 非纯对象一律跳过。
 *  - 深度与循环保护，避免异常结构导致栈溢出。
 */
const MAX_DEPTH = 12;

@Injectable()
export class SignStaticUrlsInterceptor implements NestInterceptor {
  constructor(private readonly fileUrl: FileUrlService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.walk(data, 0, new WeakSet())));
  }

  private walk(value: any, depth: number, seen: WeakSet<object>): any {
    if (depth > MAX_DEPTH || value == null) return value;

    if (typeof value === 'string') return this.walkString(value);

    if (typeof value !== 'object') return value;
    if (Buffer.isBuffer(value) || typeof (value as any).pipe === 'function') return value; // 流/文件下载
    if (value instanceof Date) return value;
    if (seen.has(value)) return value;
    seen.add(value);

    if (Array.isArray(value)) return value.map((v) => this.walk(v, depth + 1, seen));

    /**
     * 注意：TypeORM 查出来的实体是**类实例**，`Object.getPrototypeOf(x) !== Object.prototype`，
     * 早期版本在这里直接原样返回，导致列表接口里的 `/static/...` 完全没被签名（实测回归抓到）。
     * 这里对普通对象与类实例一视同仁：只取自身可枚举属性重建为普通对象，
     * Nest 序列化时本来也是按自身可枚举属性输出，行为不变。
     */
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = this.walk(v, depth + 1, seen);
    return out;
  }

  private walkString(s: string): string {
    if (!s.includes('/static/')) return s;
    const trimmed = s.trim();
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        const rewritten = this.walk(parsed, 2, new WeakSet());
        return JSON.stringify(rewritten);
      } catch {
        /* 不是合法 JSON，按普通字符串处理 */
      }
    }
    if (trimmed.startsWith('/static/')) return this.fileUrl.sign(trimmed);
    return s;
  }
}
