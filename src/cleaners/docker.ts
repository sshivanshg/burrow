/**
 * docker — reclaim via `docker system df` and `docker system prune`.
 *
 * We never poke at /var/lib/docker directly — that's Docker's house.
 * If `docker` is missing or its daemon isn't running, we return [].
 */
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

function dockerAvailable(): boolean {
  const w = Bun.spawnSync(["which", "docker"]).stdout.toString().trim();
  if (!w) return false;
  const ping = Bun.spawnSync(["docker", "info"], { stderr: "pipe" });
  return ping.exitCode === 0;
}

export const meta = {
  id: "docker",
  title: "Docker images, volumes, build cache",
  description: "Run `docker system prune` to free disk used by Docker.",
  available: dockerAvailable,
};

function parseDf(): Array<{ kind: string; reclaimable: number }> {
  // docker system df --format '{{json .}}' emits one JSON object per resource.
  const out = Bun.spawnSync(["docker", "system", "df", "--format", "{{json .}}"]).stdout.toString();
  const rows: Array<{ kind: string; reclaimable: number }> = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      const reclaim = j.Reclaimable as string | undefined;
      if (!reclaim) continue;
      const m = reclaim.match(/([\d.]+)\s*([KMGT]?B)/);
      if (!m) continue;
      const n = parseFloat(m[1]);
      const u = m[2];
      const mult =
        u === "B" ? 1 : u === "KB" ? 1024 : u === "MB" ? 1024 ** 2 : u === "GB" ? 1024 ** 3 : 1024 ** 4;
      rows.push({ kind: j.Type ?? "docker", reclaimable: n * mult });
    } catch {
      // skip unparseable
    }
  }
  return rows;
}

export async function scan(_opts: ScanOpts): Promise<Finding[]> {
  if (!dockerAvailable()) return [];
  const rows = parseDf();
  const total = rows.reduce((s, r) => s + r.reclaimable, 0);
  if (total <= 0) return [];
  return [
    {
      path: "docker:prune",
      size: total,
      category: meta.id,
      label: "docker system prune",
      description: rows.map((r) => `${r.kind}: ${(r.reclaimable / 1024 / 1024).toFixed(0)}MB`).join(", "),
      safe: true,
    },
  ];
}

export function isSafeToDelete(path: string): boolean {
  return path === "docker:prune";
}

export async function clean(picks: Finding[], opts: CleanOpts): Promise<CleanResult> {
  let removed = 0, failed = 0, freed = 0;
  const errors: CleanResult["errors"] = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (!isSafeToDelete(p.path)) {
      failed++;
      errors.push({ path: p.path, error: "refused by safety guard" });
      continue;
    }
    if (opts.dryRun) {
      removed++; freed += p.size;
      opts.onProgress?.(i + 1, picks.length, freed);
      continue;
    }
    try {
      // Conservative: prune dangling images + stopped containers + unused volumes.
      // We don't pass -a (which would remove ALL unused images).
      Bun.spawnSync(["docker", "system", "prune", "-f", "--volumes"]);
      removed++; freed += p.size;
      opts.onProgress?.(i + 1, picks.length, freed);
    } catch (e) {
      failed++;
      errors.push({ path: p.path, error: String(e) });
    }
  }
  return { removed, failed, freed, errors };
}

export const cleaner: Cleaner = { meta, scan, isSafeToDelete, clean };
export default cleaner;
