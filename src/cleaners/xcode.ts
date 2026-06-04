/**
 * xcode — Xcode's notorious storage hogs.
 *
 *   DerivedData                ~/Library/Developer/Xcode/DerivedData/*
 *   Archives                   ~/Library/Developer/Xcode/Archives/*
 *   iOS DeviceSupport          ~/Library/Developer/Xcode/iOS DeviceSupport/*
 *   watchOS DeviceSupport      …/watchOS DeviceSupport/*
 *   CoreSimulator Caches       ~/Library/Developer/CoreSimulator/Caches/*
 *
 * Archives are kept *unchecked* by default — they're sometimes shipped
 * to App Store Connect and people regret nuking them.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const XCODE = join(homedir(), "Library", "Developer", "Xcode");
const SIMS = join(homedir(), "Library", "Developer", "CoreSimulator");

const BUCKETS: Array<{ root: string; description: string; safe: boolean }> = [
  { root: join(XCODE, "DerivedData"), description: "Xcode DerivedData", safe: true },
  { root: join(XCODE, "Archives"), description: "Xcode Archive (review!)", safe: false },
  { root: join(XCODE, "iOS DeviceSupport"), description: "iOS device support", safe: true },
  { root: join(XCODE, "watchOS DeviceSupport"), description: "watchOS device support", safe: true },
  { root: join(SIMS, "Caches"), description: "Simulator cache", safe: true },
];

export const meta = {
  id: "xcode",
  title: "Xcode (DerivedData, Archives, simulators)",
  description: "Xcode build cache, archives, and simulator junk.",
  available: () => existsSync(XCODE) || existsSync(SIMS),
};

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  const paths: Array<{ path: string; description: string; safe: boolean }> = [];
  for (const b of BUCKETS) {
    let entries;
    try {
      entries = readdirSync(b.root);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.startsWith(".")) continue;
      paths.push({ path: join(b.root, e), description: b.description, safe: b.safe });
    }
  }
  const sizes = sizesOf(paths.map((p) => p.path));
  const minBytes = (opts.minMB ?? 0) * 1024 * 1024;
  return paths
    .map((p) => ({
      path: p.path,
      size: sizes.get(p.path) ?? 0,
      category: meta.id,
      label: basename(p.path),
      description: p.description,
      safe: p.safe,
    }))
    .filter((f) => f.size >= minBytes)
    .sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  for (const b of BUCKETS) {
    if (p === resolve(b.root)) return false;
    if (isUnder(p, b.root)) return passesCommonGuards(p, b.root);
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
