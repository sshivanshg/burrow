/**
 * logs — old files under ~/Library/Logs. Files older than `olderThanDays`
 * (default 30) are surfaced. macOS rolls a lot of log noise here from
 * crashed daemons and dead apps.
 */
import { readdirSync, statSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { rmSync } from "node:fs";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const LOG_ROOT = join(homedir(), "Library", "Logs");

export const meta = {
  id: "logs",
  title: "Old log files (~/Library/Logs)",
  description: "Stale logs from crashed apps and old daemons.",
  defaultSafe: true,
};

function walk(dir: string, depth: number, out: string[], max = 5) {
  if (depth > max) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(full, depth + 1, out, max);
    else if (e.isFile()) out.push(full);
  }
}

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  const olderThanDays = opts.olderThanDays ?? 30;
  const cutoff = Date.now() - olderThanDays * 24 * 3600 * 1000;
  const files: string[] = [];
  walk(LOG_ROOT, 0, files);
  const out: Finding[] = [];
  for (const f of files) {
    let st;
    try {
      st = statSync(f);
    } catch {
      continue;
    }
    if (st.mtimeMs > cutoff) continue;
    out.push({
      path: f,
      size: st.size,
      category: meta.id,
      label: basename(f),
      description: `${Math.floor((Date.now() - st.mtimeMs) / (24 * 3600 * 1000))}d old`,
      safe: true,
    });
  }
  return out.sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  if (p === resolve(LOG_ROOT)) return false;
  if (!isUnder(p, LOG_ROOT)) return false;
  return passesCommonGuards(p, LOG_ROOT);
}

export async function clean(
  picks: Finding[],
  opts: CleanOpts,
): Promise<CleanResult> {
  let removed = 0,
    failed = 0,
    freed = 0;
  const errors: CleanResult["errors"] = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (!isSafeToDelete(p.path)) {
      failed++;
      errors.push({ path: p.path, error: "refused by safety guard" });
      continue;
    }
    if (opts.dryRun) {
      removed++;
      freed += p.size;
      opts.onProgress?.(i + 1, picks.length, freed);
      continue;
    }
    try {
      rmSync(p.path, { force: true });
      removed++;
      freed += p.size;
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
