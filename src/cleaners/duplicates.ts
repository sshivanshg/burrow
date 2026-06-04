/**
 * duplicates — find duplicate FILES under a path using a 3-pass
 * progressive hash to avoid hashing terabytes:
 *
 *   1. group by size
 *   2. for groups with ≥2 files, hash the first 64KB
 *   3. for remaining groups, hash the whole file
 *
 * Emits one Finding per *duplicate copy* (the largest in a set is kept
 * as the "canonical" and not surfaced). User picks which copies to delete.
 */
import { readFileSync, readdirSync, statSync, rmSync, openSync, readSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const DEFAULT_ROOT = homedir();
const SKIP_DIRS = new Set([".git", ".Trash", "node_modules", ".cache", "Library"]);

function walkFiles(dir: string, depth: number, out: Array<{ path: string; size: number }>, maxDepth: number) {
  if (depth > maxDepth) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (e.isSymbolicLink()) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walkFiles(full, depth + 1, out, maxDepth);
    } else if (e.isFile()) {
      try {
        const st = statSync(full);
        if (st.size >= 1024) out.push({ path: full, size: st.size }); // ignore <1KB
      } catch {
        // skip
      }
    }
  }
}

function headHash(path: string): string {
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(64 * 1024);
  try {
    const n = readSync(fd, buf, 0, buf.length, 0);
    return createHash("sha1").update(buf.subarray(0, n)).digest("hex");
  } finally {
    closeSync(fd);
  }
}

function fullHash(path: string): string {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

export const meta = {
  id: "duplicates",
  title: "Duplicate files",
  description: "Hash-based duplicate finder. Surfaces extra copies; keeps one in each set.",
};

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  const root = opts.root ?? DEFAULT_ROOT;
  const maxDepth = opts.depth ?? 4;
  const minBytes = Math.max(opts.minMB ?? 1, 0) * 1024 * 1024;
  const files: Array<{ path: string; size: number }> = [];
  walkFiles(root, 0, files, maxDepth);

  // pass 1: by size
  const bySize = new Map<number, typeof files>();
  for (const f of files) {
    if (f.size < minBytes) continue;
    const arr = bySize.get(f.size) ?? [];
    arr.push(f);
    bySize.set(f.size, arr);
  }

  // pass 2: head hash within size groups
  const byHead = new Map<string, typeof files>();
  for (const [size, group] of bySize) {
    if (group.length < 2) continue;
    for (const f of group) {
      try {
        const h = `${size}:${headHash(f.path)}`;
        const arr = byHead.get(h) ?? [];
        arr.push(f);
        byHead.set(h, arr);
      } catch {
        // skip
      }
    }
  }

  // pass 3: full hash within head groups
  const byFull = new Map<string, typeof files>();
  for (const group of byHead.values()) {
    if (group.length < 2) continue;
    for (const f of group) {
      try {
        const h = fullHash(f.path);
        const arr = byFull.get(h) ?? [];
        arr.push(f);
        byFull.set(h, arr);
      } catch {
        // skip
      }
    }
  }

  // emit: keep the first (canonical) per group, surface the rest
  const out: Finding[] = [];
  for (const group of byFull.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.path.length - b.path.length); // shortest path is canonical
    for (const dup of sorted.slice(1)) {
      out.push({
        path: dup.path,
        size: dup.size,
        category: meta.id,
        label: basename(dup.path),
        description: `dup of ${basename(sorted[0].path)}`,
        safe: false,
      });
    }
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
