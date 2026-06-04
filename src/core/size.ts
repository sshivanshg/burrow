/**
 * Filesystem sizing. `du -sk` shells out to C, which is dramatically
 * faster than walking + statting from JS for big trees (node_modules
 * with 50k files would be ~10× slower in JS-land).
 */

/** Returns bytes for each path. Missing entries → 0. */
export function sizesOf(paths: string[]): Map<string, number> {
  const sizes = new Map<string, number>();
  if (paths.length === 0) return sizes;
  const BATCH = 150;
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const out = Bun.spawnSync(["du", "-sk", ...batch]).stdout.toString();
    for (const line of out.split("\n")) {
      const m = line.match(/^(\d+)\t(.+)$/);
      if (m) sizes.set(m[2], Number(m[1]) * 1024);
    }
  }
  return sizes;
}

/** Single-path version. Returns 0 on error. */
export function sizeOf(path: string): number {
  const out = Bun.spawnSync(["du", "-sk", path]).stdout.toString().trim();
  const m = out.match(/^(\d+)/);
  return m ? Number(m[1]) * 1024 : 0;
}

export function human(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i > 0 && n < 10 ? 1 : 0)} ${u[i]}`;
}
