/**
 * trash — empty the user's ~/.Trash. Each top-level item is one
 * finding so the user can keep recent things.
 *
 * Multi-volume note: macOS keeps a per-volume `.Trashes/<uid>` too,
 * but accessing those needs full-disk access we may not have, so we
 * stick to ~/.Trash by default and surface them only if readable.
 */
import { readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { rmSync } from "node:fs";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const TRASH_DIRS = [join(homedir(), ".Trash")];

export const meta = {
  id: "trash",
  title: "Trash",
  description: "Items in your ~/.Trash. Each item shown so you can keep recent things.",
  defaultSafe: true,
};

export async function scan(_opts: ScanOpts): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const trash of TRASH_DIRS) {
    let entries: string[];
    try {
      entries = readdirSync(trash);
    } catch {
      continue;
    }
    const paths = entries.filter((e) => e !== ".DS_Store").map((e) => join(trash, e));
    const sizes = sizesOf(paths);
    for (const p of paths) {
      out.push({
        path: p,
        size: sizes.get(p) ?? 0,
        category: meta.id,
        label: basename(p),
        description: "in Trash",
        safe: true,
      });
    }
  }
  return out.sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  // Must be inside one of the Trash dirs, not the Trash dir itself.
  for (const trash of TRASH_DIRS) {
    if (p === resolve(trash)) return false;
    if (!isUnder(p, trash)) continue;
    return passesCommonGuards(p, trash);
  }
  return false;
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
      rmSync(p.path, { recursive: true, force: true });
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
