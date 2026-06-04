/**
 * mail-attachments — Mail.app downloads + iMessage attachments cache.
 *
 *   ~/Library/Containers/com.apple.mail/Data/Library/Mail Downloads
 *   ~/Library/Messages/Attachments
 *
 * Mail keeps a copy of every attachment you open; iMessage caches every
 * meme anyone has ever sent you. Both regenerate on demand from server.
 */
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { sizesOf } from "../core/size.ts";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const ROOTS = [
  {
    path: join(homedir(), "Library", "Containers", "com.apple.mail", "Data", "Library", "Mail Downloads"),
    label: "Mail Downloads",
  },
  {
    path: join(homedir(), "Library", "Messages", "Attachments"),
    label: "iMessage Attachments",
  },
];

export const meta = {
  id: "mail-attachments",
  title: "Mail + iMessage attachment cache",
  description: "Opened attachments + cached iMessage media. Re-downloads on demand.",
  available: () => ROOTS.some((r) => existsSync(r.path)),
};

export async function scan(_opts: ScanOpts): Promise<Finding[]> {
  const items: Array<{ path: string; label: string }> = [];
  for (const r of ROOTS) {
    if (!existsSync(r.path)) continue;
    let entries;
    try {
      entries = readdirSync(r.path);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.startsWith(".")) continue;
      items.push({ path: join(r.path, e), label: `${r.label}/${e}` });
    }
  }
  const sizes = sizesOf(items.map((i) => i.path));
  return items
    .map((i) => ({
      path: i.path,
      size: sizes.get(i.path) ?? 0,
      category: meta.id,
      label: i.label,
      description: "attachment cache",
      safe: false, // user reviews
    }))
    .filter((f) => f.size > 0)
    .sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  const p = resolve(path);
  for (const r of ROOTS) {
    if (p === resolve(r.path)) return false;
    if (isUnder(p, r.path)) return passesCommonGuards(p, r.path);
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
