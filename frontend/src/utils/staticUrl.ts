/**
 * 静态资源 URL 工具（2026-11-24）
 *
 * 背景：后端签名拦截器会把响应里所有 `/static/...` 路径加签成
 * `/static/x.mp4?exp=<秒>&sig=<hex>`（见 AGENTS.md 2026-11-23 越权修复）。
 * 因此前端再往这些 URL 上追加查询参数时，必须判断有没有已存在的 query：
 * 用 `?` 直接拼会造出 `...?exp=..&sig=..?download=1` 这种两个问号的地址。
 * 实测服务端按第一个 `?` 截断解析，签名仍然有效（不会 403），但 `download=1`
 * 会被静默丢掉 —— 属于「看着能用其实参数没生效」的隐蔽错误。
 */

/** 追加 download=1（/static 产物的下载按钮用）；已带 query 时改用 & 连接 */
export function withDownload(url: string | null | undefined): string {
  if (!url) return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}download=1`;
}
