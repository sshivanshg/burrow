/**
 * Generic recursive directory walker. Each cleaner supplies a `match`
 * predicate; when a directory matches, we record it and don't descend
 * into it (so nested node_modules etc. aren't double-counted).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

export interface WalkOpts {
  root: string;
  maxDepth?: number;
  /** Return true to record this dir as a finding (and stop descending). */
  match: (name: string, fullPath: string) => boolean;
  /** Return true to skip descending into this dir entirely. */
  skipDescend?: (name: string) => boolean;
  /** Follow symlinks? Default false. */
  followSymlinks?: boolean;
}

const DEFAULT_SKIP = new Set([".git", ".Trash", "Library", ".npm"]);

export function walkDirs(opts: WalkOpts): string[] {
  const found: string[] = [];
  const maxDepth = opts.maxDepth ?? 6;
  const follow = opts.followSymlinks ?? false;

  function visit(dir: string, depth: number) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // permission denied / vanished
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!follow && e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (opts.match(e.name, full)) {
        found.push(full);
        continue; // don't descend into a match
      }
      if (DEFAULT_SKIP.has(e.name)) continue;
      if (opts.skipDescend?.(e.name)) continue;
      if (depth < maxDepth) visit(full, depth + 1);
    }
  }

  visit(opts.root, 0);
  return found;
}
