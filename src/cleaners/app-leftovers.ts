/**
 * app-leftovers — given an app name (e.g. "Slack" or "com.tinyspeck.slackmacgap"),
 * hunt for files an uninstalled app leaves behind across:
 *
 *   ~/Library/Application Support/<name>
 *   ~/Library/Preferences/<name>*.plist
 *   ~/Library/Saved Application State/<name>.savedState
 *   ~/Library/Caches/<name>
 *   ~/Library/Containers/<name>
 *   ~/Library/Group Containers/group.<name>.*
 *   ~/Library/LaunchAgents/<name>*.plist
 *   ~/Library/Logs/<name>
 *
 * Matches by exact dir name, prefix, or substring. Caller passes the
 * app via ScanOpts.appName.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const LIB = join(homedir(), "Library");

const SEARCH_ROOTS: Array<{ root: string; matchMode: "exact" | "prefix" | "substring" }> = [
  { root: join(LIB, "Application Support"), matchMode: "substring" },
  { root: join(LIB, "Preferences"), matchMode: "substring" },
  { root: join(LIB, "Saved Application State"), matchMode: "substring" },
  { root: join(LIB, "Caches"), matchMode: "substring" },
  { root: join(LIB, "Containers"), matchMode: "substring" },
  { root: join(LIB, "Group Containers"), matchMode: "substring" },
  { root: join(LIB, "LaunchAgents"), matchMode: "substring" },
  { root: join(LIB, "Logs"), matchMode: "substring" },
];

export const meta = {
  id: "app-leftovers",
  title: "Leftover files from uninstalled apps",
  description: "Hunt Application Support / Preferences / Containers / etc. for an app's debris.",
};

function nameMatches(entry: string, needle: string): boolean {
  const a = entry.toLowerCase();
  const b = needle.toLowerCase();
  if (a === b) return true;
  if (a.startsWith(b + ".") || a.startsWith(b + " ")) return true;
  if (a.includes(b)) return true;
  return false;
}

export async function scan(opts: ScanOpts & { appName?: string }): Promise<Finding[]> {
  const needle = (opts.appName ?? "").trim();
  if (!needle) return [];
  const found: Array<{ path: string; root: string }> = [];
  for (const { root } of SEARCH_ROOTS) {
    let entries;
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.startsWith(".")) continue;
      if (nameMatches(e, needle)) found.push({ path: join(root, e), root });
    }
  }
  const sizes = sizesOf(found.map((f) => f.path));
  return found
    .map((f) => ({
      path: f.path,
      size: sizes.get(f.path) ?? 0,
      category: meta.id,
      label: basename(f.path),
      description: `in ${basename(f.root)}`,
      safe: false, // user verifies
    }))
    .sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  for (const r of SEARCH_ROOTS) {
    if (p === resolve(r.root)) return false;
    if (isUnder(p, r.root)) return passesCommonGuards(p, r.root);
  }
  return false;
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
      rmSync(p.path, { recursive: true, force: true });
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
