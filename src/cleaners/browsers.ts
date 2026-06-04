/**
 * browsers — per-browser CACHE only. Never history, never cookies,
 * never saved passwords. Browsers regenerate caches on first load,
 * but they'll be furious if we touch profile-state stores.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

interface CacheRoot {
  browser: string;
  path: string;
  // glob children only (e.g. Firefox needs Profiles/<id>/cache2)
  globChildren?: boolean;
}

function pathsForBrowsers(): CacheRoot[] {
  const c = (p: string) => join(homedir(), "Library", "Caches", p);
  const out: CacheRoot[] = [];
  // Chrome
  out.push({ browser: "Chrome", path: c("Google/Chrome") });
  out.push({ browser: "Chrome", path: join(homedir(), "Library", "Application Support", "Google", "Chrome", "Default", "Cache") });
  // Safari
  out.push({ browser: "Safari", path: c("com.apple.Safari") });
  // Firefox profile caches
  const ff = join(homedir(), "Library", "Caches", "Firefox", "Profiles");
  out.push({ browser: "Firefox", path: ff, globChildren: true });
  // Arc
  out.push({ browser: "Arc", path: c("Arc") });
  out.push({ browser: "Arc", path: join(homedir(), "Library", "Application Support", "Arc", "User Data", "Default", "Cache") });
  // Brave
  out.push({ browser: "Brave", path: c("BraveSoftware/Brave-Browser") });
  return out;
}

const ROOTS = pathsForBrowsers();

export const meta = {
  id: "browsers",
  title: "Browser caches (Chrome, Safari, Firefox, Arc, Brave)",
  description: "Cache only — never history, cookies, or saved passwords.",
  available: () => ROOTS.some((r) => existsSync(r.path)),
};

export async function scan(_opts: ScanOpts): Promise<Finding[]> {
  const collected: Array<{ path: string; browser: string }> = [];
  for (const r of ROOTS) {
    if (!existsSync(r.path)) continue;
    if (r.globChildren) {
      let entries;
      try {
        entries = readdirSync(r.path);
      } catch {
        continue;
      }
      for (const e of entries) {
        const cacheDir = join(r.path, e, "cache2");
        if (existsSync(cacheDir)) collected.push({ path: cacheDir, browser: r.browser });
      }
    } else {
      collected.push({ path: r.path, browser: r.browser });
    }
  }
  const sizes = sizesOf(collected.map((c) => c.path));
  return collected
    .map((c) => ({
      path: c.path,
      size: sizes.get(c.path) ?? 0,
      category: meta.id,
      label: `${c.browser} cache`,
      description: basename(c.path),
      safe: true,
    }))
    .filter((f) => f.size > 0)
    .sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  // Path must be one of the known cache dirs (or a Firefox cache2 subdir).
  for (const r of ROOTS) {
    if (r.globChildren) {
      // Allow any path that ends in /cache2 under r.path/*
      if (isUnder(p, r.path) && basename(p) === "cache2" && passesCommonGuards(p, r.path)) return true;
    } else {
      if (p === resolve(r.path) || isUnder(p, r.path)) return passesCommonGuards(p, r.path);
    }
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
