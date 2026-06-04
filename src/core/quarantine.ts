/**
 * Quarantine — soft-delete instead of rm.
 *
 * Layout:
 *   ~/.burrow-quarantine/
 *     2026-06-04T17-30-12_dev-junk/
 *       manifest.json            { items: [{ original, stored, size, category }] }
 *       items/
 *         0000_node_modules/     (the actual moved dir)
 *         0001_dist/
 *
 * Same-filesystem moves are O(1) (rename). Cross-fs falls back to copy+rm.
 */
import { mkdirSync, renameSync, rmSync, readdirSync, statSync, writeFileSync, readFileSync, existsSync, cpSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { quarantineRoot } from "./paths.ts";

export interface QuarantineEntry {
  original: string;
  stored: string;
  size: number;
  category: string;
}

export interface QuarantineBatch {
  id: string;          // dirname under quarantineRoot
  createdAt: string;   // ISO timestamp
  category: string;
  items: QuarantineEntry[];
  totalSize: number;
}

function isoStamp(d = new Date()): string {
  // Filesystem-safe ISO: 2026-06-04T17-30-12-123Z
  return d.toISOString().replace(/[:.]/g, "-");
}

function safeMove(from: string, to: string) {
  try {
    renameSync(from, to);
  } catch (e: any) {
    if (e?.code === "EXDEV") {
      // cross-filesystem — copy + remove
      cpSync(from, to, { recursive: true });
      rmSync(from, { recursive: true, force: true });
    } else {
      throw e;
    }
  }
}

/**
 * Move a batch of items into quarantine. Returns the batch record.
 * If `dryRun` is true, returns the would-be record without touching disk.
 */
export function quarantineBatch(
  category: string,
  items: Array<{ path: string; size: number }>,
  dryRun = false,
  now = new Date(),
): QuarantineBatch {
  const id = `${isoStamp(now)}_${category}`;
  const batchDir = join(quarantineRoot(), id);
  const itemsDir = join(batchDir, "items");
  const entries: QuarantineEntry[] = [];
  let total = 0;

  for (let i = 0; i < items.length; i++) {
    const src = resolve(items[i].path);
    const slot = `${String(i).padStart(4, "0")}_${basename(src)}`;
    const stored = join(itemsDir, slot);
    entries.push({ original: src, stored, size: items[i].size, category });
    total += items[i].size;
  }

  if (dryRun) {
    return { id, createdAt: now.toISOString(), category, items: entries, totalSize: total };
  }

  mkdirSync(itemsDir, { recursive: true });
  for (const e of entries) {
    try {
      safeMove(e.original, e.stored);
    } catch (err) {
      // best-effort: leave the failed entry in the manifest with a marker
      (e as any).error = String(err);
    }
  }
  const manifest = { id, createdAt: now.toISOString(), category, items: entries, totalSize: total };
  writeFileSync(join(batchDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

/** List all quarantine batches, newest first. */
export function listBatches(): QuarantineBatch[] {
  const root = quarantineRoot();
  if (!existsSync(root)) return [];
  const dirs = readdirSync(root).filter((d) => !d.startsWith("."));
  const out: QuarantineBatch[] = [];
  for (const d of dirs) {
    const mfp = join(root, d, "manifest.json");
    if (!existsSync(mfp)) continue;
    try {
      const m = JSON.parse(readFileSync(mfp, "utf8")) as QuarantineBatch;
      out.push(m);
    } catch {
      // ignore broken batches
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Restore one quarantined item back to its original path. */
export function restoreEntry(entry: QuarantineEntry): { ok: boolean; error?: string } {
  if (!existsSync(entry.stored)) return { ok: false, error: "stored item is missing" };
  if (existsSync(entry.original)) {
    return { ok: false, error: "original path already exists; refusing to overwrite" };
  }
  try {
    mkdirSync(dirname(entry.original), { recursive: true });
    safeMove(entry.stored, entry.original);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Restore every item in a batch. Returns per-entry results. */
export function restoreBatch(batch: QuarantineBatch) {
  const results = batch.items.map((e) => ({ entry: e, ...restoreEntry(e) }));
  // If everything was restored, remove the now-empty batch dir.
  if (results.every((r) => r.ok)) {
    rmSync(join(quarantineRoot(), batch.id), { recursive: true, force: true });
  }
  return results;
}

/** Permanently delete one batch (or all batches older than N days). */
export function purge(opts: { id?: string; olderThanDays?: number } = {}): {
  removed: number;
  freed: number;
} {
  let removed = 0;
  let freed = 0;
  const batches = listBatches();
  const cutoff = opts.olderThanDays != null ? Date.now() - opts.olderThanDays * 86400_000 : 0;
  for (const b of batches) {
    if (opts.id && b.id !== opts.id) continue;
    if (opts.olderThanDays != null && Date.parse(b.createdAt) > cutoff) continue;
    const dir = join(quarantineRoot(), b.id);
    try {
      const sz = dirSize(dir);
      rmSync(dir, { recursive: true, force: true });
      removed++;
      freed += sz;
    } catch {
      // skip
    }
  }
  return { removed, freed };
}

function dirSize(p: string): number {
  let total = 0;
  function walk(d: string) {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else total += st.size;
      } catch {
        // skip
      }
    }
  }
  walk(p);
  return total;
}
