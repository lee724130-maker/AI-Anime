// Safari 对 `YYYY-MM-DD HH:mm:ss`（无 T）格式解析为 Invalid Date，
// 统一容错：先替换空格为 T，再解析；失败返回 null。
export function parseDateSafe(v?: string | null): Date | null {
  if (!v) return null;
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(v) ? v.replace(' ', 'T') : v;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateSafe(v?: string | null, locale: string = 'zh-CN'): string {
  const d = parseDateSafe(v);
  if (!d) return v || '-';
  return d.toLocaleString(locale, { hour12: false });
}
