import { BadRequestException } from '@nestjs/common';

/** promo 两表（activities / feature_releases）共用校验（同 showcase-admin 模式） */

export function vstr(v: unknown, field: string, max: number, required = false): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (required) throw new BadRequestException(`${field} 不能为空`);
    return null;
  }
  if (s.length > max) throw new BadRequestException(`${field} 长度不能超过 ${max}`);
  return s;
}

/** 站内 /static/、http(s) 外链、或站内路由（/xxx，前端路由跳转用） */
export function vlink(v: unknown, field: string, required = false): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) {
    if (required) throw new BadRequestException(`${field} 不能为空`);
    return null;
  }
  if (!/^(\/static\/|\/[a-z]|https?:\/\/)/i.test(s)) {
    throw new BadRequestException(`${field} 仅支持站内路由（如 /generate）、/static/ 地址或 http(s) 外链`);
  }
  if (s.length > 500) throw new BadRequestException(`${field} 长度不能超过 500`);
  return s;
}

export function vint(v: unknown, field: string, min: number, max: number, fallback: number): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequestException(`${field} 必须是数字`);
  if (n < min || n > max) throw new BadRequestException(`${field} 范围 ${min}~${max}`);
  return Math.round(n);
}

export function venum(v: unknown, field: string, allowed: readonly string[], fallback: string): string {
  const s = typeof v === 'string' ? v : fallback;
  if (!allowed.includes(s)) throw new BadRequestException(`${field} 仅支持 ${allowed.join('/')}`);
  return s;
}

/** 日期时间：空 → null；合法 Date/字符串 → Date；非法 → 400 */
export function vdate(v: unknown, field: string): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} 时间格式非法`);
  return d;
}
