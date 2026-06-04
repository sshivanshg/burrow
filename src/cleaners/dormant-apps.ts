/**
 * dormant-apps — find .app bundles you haven't opened in 90+ days and
 * surface them as uninstall candidates.
 *
 * Last-used date comes from Spotlight's kMDItemLastUsedDate (the same
 * field "Recently Used" surfaces in Finder). Apps without an indexed
 * lastUsed value are treated as "never opened by this user".
 *
 * The Finding.path is the .app bundle itself. Cleaning it removes the
 * bundle; users can chain `burrow uninstall <name>` afterwards to mop
 * up Application Support / Preferences / Containers etc.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const APP_ROOTS = [
  "/Applications",
  join(homedir(), "Applications"),
];

// Apps we never want to flag, even if they were last opened a year ago.
const PROTECTED = new Set([
  "Safari.app",
  "Mail.app",
  "Messages.app",
  "FaceTime.app",
  "Finder.app",
  "System Settings.app",
  "Calendar.app",
  "Contacts.app",
  "Photos.app",
  "Music.app",
  "TV.app",
  "App Store.app",
  "Notes.app",
  "Reminders.app",
  "Maps.app",
  "Stocks.app",
  "Home.app",
  "Weather.app",
  "FindMy.app",
  "Books.app",
  "Podcasts.app",
  "Voice Memos.app",
  "Image Capture.app",
  "Preview.app",
  "TextEdit.app",
  "QuickTime Player.app",
  "Migration Assistant.app",
  "Activity Monitor.app",
  "Disk Utility.app",
  "Time Machine.app",
  "Terminal.app",
]);

function lastUsedDays(bundle: string): number | null {
  const r = Bun.spawnSync(
    ["mdls", "-name", "kMDItemLastUsedDate", "-raw", bundle],
    { stderr: "ignore" },
  );
  const out = r.stdout.toString().trim();
  if (!out || out === "(null)") return null;
  const t = Date.parse(out);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400_000);
}

export const meta = {
  id: "dormant-apps",
  title: "Dormant apps (not opened in 90+ days)",
  description: "Apps you haven't launched in months. Big wins, just verify before removing.",
  available: () => APP_ROOTS.some((r) => existsSync(r)),
};

export async function scan(opts: ScanOpts): Promise<Finding[]> {
  const olderThanDays = opts.olderThanDays ?? 90;
  const bundles: Array<{ path: string; days: number | null }> = [];
  for (const root of APP_ROOTS) {
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.name.endsWith(".app")) continue;
      if (PROTECTED.has(e.name)) continue;
      const bundle = join(root, e.name);
      const days = lastUsedDays(bundle);
      if (days === null || days >= olderThanDays) {
        bundles.push({ path: bundle, days });
      }
    }
  }
  const sizes = sizesOf(bundles.map((b) => b.path));
  return bundles
    .map((b) => ({
      path: b.path,
      size: sizes.get(b.path) ?? 0,
      category: meta.id,
      label: basename(b.path).replace(/\.app$/, ""),
      description:
        b.days === null
          ? "never opened by this user"
          : `${b.days}d since last open`,
      safe: false, // user-visible apps — never pre-check
    }))
    .filter((f) => f.size > 0)
    .sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  if (PROTECTED.has(basename(p))) return false;
  if (!p.endsWith(".app")) return false;
  for (const root of APP_ROOTS) {
    if (isUnder(p, root)) return passesCommonGuards(p, root);
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
