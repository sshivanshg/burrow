/**
 * homebrew — old downloads under brew's cache, plus what
 * `brew cleanup -s -n` would free. We never directly rm files brew
 * owns; we just shell out to brew.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { passesCommonGuards, isUnder } from "../core/safety.ts";
import { sizeOf } from "../core/size.ts";
import type { Cleaner, CleanOpts, CleanResult, Finding, ScanOpts } from "../core/types.ts";

const BREW_CACHES = [
  "/opt/homebrew/var/homebrew/locks", // safe to nuke
  join(homedir(), "Library", "Caches", "Homebrew"),
];

function hasBrew(): boolean {
  const r = Bun.spawnSync(["which", "brew"]).stdout.toString().trim();
  return r.length > 0;
}

export const meta = {
  id: "homebrew",
  title: "Homebrew downloads + caches",
  description: "Old bottles, source tarballs, and `brew cleanup -s` candidates.",
  available: hasBrew,
};

async function previewBrewCleanup(): Promise<{ description: string; size: number } | null> {
  if (!hasBrew()) return null;
  const out = Bun.spawnSync(["brew", "cleanup", "-s", "-n"]).stdout.toString();
  // `brew cleanup -n` prints lines like:
  //   Would remove: /Users/x/Library/Caches/Homebrew/foo-1.2.3.tar.gz (12MB)
  // Tally what's there.
  let total = 0;
  for (const line of out.split("\n")) {
    const m = line.match(/\(([\d.]+)\s*([KMGT]?B)\)/);
    if (!m) continue;
    const n = parseFloat(m[1]);
    const u = m[2];
    const mult =
      u === "B" ? 1 : u === "KB" ? 1024 : u === "MB" ? 1024 ** 2 : u === "GB" ? 1024 ** 3 : 1024 ** 4;
    total += n * mult;
  }
  return { description: "brew cleanup -s", size: total };
}

export async function scan(_opts: ScanOpts): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const path of BREW_CACHES) {
    if (!existsSync(path)) continue;
    out.push({
      path,
      size: sizeOf(path),
      category: meta.id,
      label: path.split("/").pop()!,
      description: "Homebrew cache",
      safe: true,
    });
  }
  const preview = await previewBrewCleanup();
  if (preview && preview.size > 0) {
    out.push({
      path: "brew:cleanup",
      size: preview.size,
      category: meta.id,
      label: "brew cleanup -s",
      description: preview.description,
      safe: true,
    });
  }
  return out.sort((a, b) => b.size - a.size);
}

export function isSafeToDelete(path: string): boolean {
  if (path === "brew:cleanup") return true; // virtual finding
  const p = resolve(path);
  for (const root of BREW_CACHES) {
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
      if (p.path === "brew:cleanup") {
        Bun.spawnSync(["brew", "cleanup", "-s"]);
      } else {
        const { rmSync } = await import("node:fs");
        rmSync(p.path, { recursive: true, force: true });
      }
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
