/**
 * large-files — find the biggest individual files under a path. Useful
 * as a discovery tool; deletion still goes through the picker with
 * a scope-guard so we never reach outside `root`.
 */
import { readdirSync, statSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const DEFAULT_ROOT = homedir();
const SKIP_DIRS = new Set([".git", ".Trash", "node_modules", ".cache", "Library"]);

function walkFiles(dir: string, depth: number, out: string[], maxDepth: number) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && depth === 0) continue;
    if (e.isSymbolicLink()) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkFiles(full, depth + 1, out, maxDepth);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

export const meta = {
  id: "large-files",
  title: "Largest individual files",
  description: "Find the biggest files under a path. Pure discovery — pre-checks nothing.",
};

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  const root = opts.root ?? DEFAULT_ROOT;
  const maxDepth = opts.depth ?? 4;
  const minBytes = Math.max(opts.minMB ?? 100, 10) * 1024 * 1024;
  const files: string[] = [];
  walkFiles(root, 0, files, maxDepth);
  const out: Finding[] = [];
  for (const f of files) {
    let st;
    try {
      st = statSync(f);
    } catch {
      continue;
    }
    if (st.size < minBytes) continue;
    out.push({
      path: f,
      size: st.size,
      category: meta.id,
      label: basename(f),
      description: "large file",
      safe: false,
    });
  }
  return out.sort((a, b) => b.size - a.size).slice(0, 200);
}

export function isSafeToDelete(path: string, opts: ScanOpts): boolean {
  const root = opts.root ?? DEFAULT_ROOT;
  const p = resolve(path);
  if (!isUnder(p, root)) return false;
  return passesCommonGuards(p, root);
}

export async function clean(
  picks: Finding[],
  opts: CleanOpts & ScanOpts,
): Promise<CleanResult> {
  const root = opts.root ?? DEFAULT_ROOT;
  let removed = 0, failed = 0, freed = 0;
  const errors: CleanResult["errors"] = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (!isSafeToDelete(p.path, { root })) {
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
      rmSync(p.path, { force: true });
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
