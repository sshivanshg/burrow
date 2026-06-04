/**
 * dev-junk — the original burrow cleaner. Scans a project tree for
 * build artifacts, dependency dirs, and toolchain caches. Pre-checks
 * unambiguous categories (node_modules, .next, caches); leaves the
 * ambiguous ones (dist, build, target, venv) unchecked.
 */
import { basename } from "node:path";
import { rmSync } from "node:fs";
import { walkDirs } from "../core/scan.ts";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

interface JunkSpec {
  description: string;
  safe: boolean;
}

export const JUNK: Record<string, JunkSpec> = {
  node_modules: { description: "Node deps", safe: true },
  ".next": { description: "Next.js build", safe: true },
  ".nuxt": { description: "Nuxt build", safe: true },
  ".svelte-kit": { description: "SvelteKit build", safe: true },
  ".turbo": { description: "Turborepo cache", safe: true },
  ".parcel-cache": { description: "Parcel cache", safe: true },
  ".cache": { description: "Cache", safe: true },
  ".vite": { description: "Vite cache", safe: true },
  coverage: { description: "Coverage report", safe: true },
  __pycache__: { description: "Python bytecode", safe: true },
  ".pytest_cache": { description: "Pytest cache", safe: true },
  ".mypy_cache": { description: "Mypy cache", safe: true },
  ".ruff_cache": { description: "Ruff cache", safe: true },
  ".gradle": { description: "Gradle cache", safe: true },
  DerivedData: { description: "Xcode build", safe: true },
  // Ambiguous — unchecked by default:
  dist: { description: "Build output", safe: false },
  build: { description: "Build output", safe: false },
  out: { description: "Build output", safe: false },
  target: { description: "Rust/Java build", safe: false },
  venv: { description: "Python venv", safe: false },
  ".venv": { description: "Python venv", safe: false },
};

const SKIP_DESCEND = new Set([".git", ".Trash", "Library", ".npm", "node_modules"]);

export const meta = {
  id: "dev-junk",
  title: "Dev-tool junk (node_modules, .next, caches…)",
  description: "Build artifacts and dependency dirs across your project tree.",
};

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  const root = opts.root ?? process.cwd();
  const paths = walkDirs({
    root,
    maxDepth: opts.depth ?? 6,
    match: (name) => name in JUNK,
    skipDescend: (name) => SKIP_DESCEND.has(name),
  });
  const sizes = sizesOf(paths);
  const minBytes = (opts.minMB ?? 0) * 1024 * 1024;
  return paths
    .map((p) => {
      const name = basename(p);
      const spec = JUNK[name];
      return {
        path: p,
        size: sizes.get(p) ?? 0,
        category: meta.id,
        label: name,
        description: spec.description,
        safe: spec.safe,
      } satisfies Finding;
    })
    .filter((f) => f.size >= minBytes);
}

export function isSafeToDelete(path: string, opts: ScanOpts): boolean {
  const root = opts.root ?? process.cwd();
  if (!passesCommonGuards(path, root)) return false;
  if (!(basename(path) in JUNK)) return false;
  return true;
}

export async function clean(
  picks: Finding[],
  opts: CleanOpts & ScanOpts,
): Promise<CleanResult> {
  const root = opts.root ?? process.cwd();
  const errors: CleanResult["errors"] = [];
  let removed = 0;
  let failed = 0;
  let freed = 0;
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (!isSafeToDelete(p.path, { ...opts, root })) {
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
