/**
 * system-caches — top-level dirs under ~/Library/Caches. Most apps treat
 * this as fully disposable, but a few misuse it for state, so we use
 * an allowlist:
 *
 *   - DENY anything in DENYLIST (apps known to break or lose state)
 *   - PRE-CHECK anything in SAFE_ALLOWLIST (well-known cache piles)
 *   - leave the rest unchecked (still scannable, user opts in)
 */
import { readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { rmSync } from "node:fs";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const CACHE_ROOT = join(homedir(), "Library", "Caches");

/** Apps that cache safely and recreate everything on next launch. */
const SAFE_ALLOWLIST = new Set<string>([
  "Google",
  "com.google.Chrome",
  "com.apple.Safari",
  "com.apple.Safari.SafeBrowsing",
  "com.apple.helpd",
  "com.apple.iconservices",
  "com.apple.akd",
  "com.apple.bird",
  "com.apple.imfoundation",
  "com.apple.amsengagementd",
  "com.apple.appstoreagent",
  "com.spotify.client",
  "com.tinyspeck.slackmacgap",
  "com.hnc.Discord",
  "com.microsoft.VSCode",
  "com.microsoft.teams",
  "com.figma.Desktop",
  "Homebrew",
  "Yarn",
  "pip",
  "pypoetry",
  "go-build",
  "deno",
  "ms-playwright",
  "Cypress",
  "puppeteer",
  "node-gyp",
  "JetBrains",
]);

/** Apps that misuse Caches/ for actual state. NEVER clear these. */
const DENYLIST = new Set<string>([
  "com.apple.WebKit.PluginProcess", // can break Safari sandbox
  "com.apple.cloudkit", // CloudKit can re-sync from these
]);

export const meta = {
  id: "system-caches",
  title: "App caches (~/Library/Caches)",
  description: "App-level caches. Allowlisted apps pre-checked, others opt-in.",
};

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  let entries;
  try {
    entries = readdirSync(CACHE_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    if (!e.isDirectory()) continue;
    if (DENYLIST.has(e.name)) continue;
    paths.push(join(CACHE_ROOT, e.name));
  }
  const sizes = sizesOf(paths);
  const minBytes = (opts.minMB ?? 0) * 1024 * 1024;
  const out: Finding[] = [];
  for (const p of paths) {
    const size = sizes.get(p) ?? 0;
    if (size < minBytes) continue;
    const name = basename(p);
    out.push({
      path: p,
      size,
      category: meta.id,
      label: name,
      description: SAFE_ALLOWLIST.has(name) ? "safe to clear" : "review",
      safe: SAFE_ALLOWLIST.has(name),
    });
  }
  return out.sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  if (p === resolve(CACHE_ROOT)) return false;
  if (!isUnder(p, CACHE_ROOT)) return false;
  if (DENYLIST.has(basename(p))) return false;
  return passesCommonGuards(p, CACHE_ROOT);
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
      // Remove cache contents but leave the dir so apps don't error.
      // (rmSync recursive on the dir itself is fine for most; we keep
      // it simple and just delete the dir — apps recreate it.)
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
