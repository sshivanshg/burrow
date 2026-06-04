/**
 * Disk-free helper. Uses `df -kP /` so output is portable across
 * darwin/linux (kbyte blocks, POSIX columns).
 */

export interface DiskInfo {
  total: number;
  used: number;
  available: number;
  mount: string;
}

export function diskInfo(mount = "/"): DiskInfo | null {
  const out = Bun.spawnSync(["df", "-kP", mount]).stdout.toString();
  const lines = out.trim().split("\n");
  if (lines.length < 2) return null;
  const parts = lines[1].trim().split(/\s+/);
  // Filesystem 1024-blocks Used Available Capacity Mounted-on
  const total = Number(parts[1]) * 1024;
  const used = Number(parts[2]) * 1024;
  const available = Number(parts[3]) * 1024;
  return { total, used, available, mount: parts[5] ?? mount };
}
