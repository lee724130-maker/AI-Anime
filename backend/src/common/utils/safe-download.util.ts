import * as dns from 'dns';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

/** backend/output 目录（/static/ 静态资源映射根） */
export function getOutputDir(): string {
  return path.resolve(process.cwd(), 'output');
}

/**
 * 将用户可控路径安全解析到 output 目录内（防任意文件读取 / 目录穿越）。
 * 支持三种格式：
 *  - /static/xxx        → output/xxx（xxx 禁止含 .. 与分隔符穿越）
 *  - output 内的绝对路径 → 原样放行
 *  - 纯文件名           → output/xxx
 * 其余（相对路径、含 .. / 分隔符、输出目录外的绝对路径）一律返回 null。
 */
export function resolveSafeStaticPath(input: string): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  let rel: string;
  if (input.startsWith('/static/')) {
    rel = input.slice('/static/'.length);
  } else if (path.isAbsolute(input)) {
    const outDir = getOutputDir();
    const resolved = path.resolve(input);
    if (!resolved.startsWith(outDir + path.sep)) return null;
    return resolved;
  } else {
    if (input.includes('\\') || input.includes('/') || input.startsWith('.')) return null;
    rel = input;
  }
  if (!rel || rel.includes('..')) return null;
  const outDir = getOutputDir();
  const full = path.resolve(outDir, rel);
  if (!full.startsWith(outDir + path.sep)) return null;
  return full;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 0) return true;
  if (ip === '::1') return true;
  if (/^f[cd][0-9a-f]{0,4}/i.test(ip)) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** SSRF guard: reject non-http(s) URLs and any host resolving to a private/loopback IP */
export async function assertSafeRemoteUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('非法 URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('仅允许 http/https 外链下载');
  }
  const ips = await new Promise<string[]>((resolve, reject) => {
    dns.lookup(u.hostname, { all: true }, (err, addrs) => {
      if (err) reject(new Error('域名解析失败'));
      else resolve(addrs.map((a) => a.address));
    });
  });
  if (!ips.length || ips.some(isPrivateIp)) {
    throw new Error('不允许访问内网地址');
  }
}

/**
 * Stream a remote file to disk with SSRF guard + size cap.
 * Never buffers the whole body in memory.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  opts?: { maxBytes?: number; timeoutMs?: number },
): Promise<void> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  await assertSafeRemoteUrl(url);
  const resp = await axios.get(url, {
    responseType: 'stream',
    timeout: opts?.timeoutMs ?? 60000,
    maxRedirects: 2,
  });
  const stream: NodeJS.ReadableStream = resp.data;
  const file = fs.createWriteStream(destPath);
  let received = 0;
  let rejected = false;
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes && !rejected) {
        rejected = true;
        reject(new Error(`下载文件超过大小上限 ${Math.round(maxBytes / 1024 / 1024)}MB`));
        try { file.destroy(); } catch { /* ignore */ }
        try { (stream as any).destroy(); } catch { /* ignore */ }
      }
    });
    stream.on('error', (err) => reject(err));
    file.on('error', (err) => reject(err));
    file.on('finish', () => resolve());
    stream.pipe(file);
  });
  if (rejected) throw new Error('下载文件超过大小上限');
}
