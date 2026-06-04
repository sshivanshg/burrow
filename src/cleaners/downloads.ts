/**
 * downloads — files in ~/Downloads older than `olderThanDays` (default 90).
 *
 * Non-recursive on purpose: people put projects in subfolders, and we
 * don't want to walk into them.
 */
import { readdirSync, statSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const DOWNLOADS = join(homedir(), "Downloads");

export const meta = {
  id: "downloads",
  title: "Old downloads (~/Downloads)",
  description: "Top-level files older than N days. Subfolders are left alone.",
  defaultSafe: false, // user-visible files — never pre-check
};

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  const cutoff = Date.now() - (opts.olderThanDays ?? 90) * 24 * 3600 * 1000;
  let entries;
  try {
    entries = readdirSync(DOWNLOADS, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Finding[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) continue; // skip subfolders entirely
    const full = join(DOWNLOADS, e.name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.mtimeMs > cutoff) continue;
    out.push({
      path: full,
      size: st.size,
      category: meta.id,
      label: e.name,
      description: `${Math.floor((Date.now() - st.mtimeMs) / (24 * 3600 * 1000))}d old`,
      safe: false,
    });
  }
  return out.sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  if (p === resolve(DOWNLOADS)) return false;
  if (!isUnder(p, DOWNLOADS)) return false;
  return passesCommonGuards(p, DOWNLOADS);
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
