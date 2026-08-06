import { execSync } from 'child_process';

/**
 * Free disk space (bytes) on the filesystem hosting `dir`.
 * Returns Infinity when it cannot be determined (fail-open for dev machines).
 */
export function diskFreeBytes(dir: string): number {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-PSDrive -Name (Split-Path -Qualifier '${dir}').TrimEnd(':')).Free"`,
        { timeout: 10000 },
      ).toString().trim();
      const n = Number(out);
      return isFinite(n) ? n : Infinity;
    }
    const out = execSync(`df -k --output=avail "${dir}" 2>/dev/null`, { timeout: 10000 }).toString().trim().split('\n');
    const kb = Number(out[out.length - 1]);
    return isFinite(kb) && kb >= 0 ? kb * 1024 : Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Deployment guard: refuse long-running render/download jobs when the disk is
 * nearly full, so a runaway generation cannot fill the disk and freeze the host.
 */
export function assertDiskSpace(dir: string, minBytes: number): void {
  const free = diskFreeBytes(dir);
  if (free < minBytes) {
    throw new Error(
      `磁盘空间不足（剩余 ${(free / 1024 / 1024 / 1024).toFixed(1)}G，需至少 ${(minBytes / 1024 / 1024 / 1024).toFixed(1)}G），请先清理输出文件`,
    );
  }
}
