/**
 * Append-only JSONL history of every clean burrow performs, plus a
 * persisted lifetime stats object for fast read.
 *
 *   ~/Library/Application Support/burrow/history.jsonl
 *   ~/Library/Application Support/burrow/state.json
 *
 * History rows are intentionally small — no per-item paths, just
 * aggregates per batch. Power users can dump individual items via
 * `burrow clean ... --json` if they want that fidelity.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { historyFile, stateFile } from "./paths.ts";

export interface HistoryRow {
  ts: string;          // ISO
  category: string;
  removed: number;
  failed: number;
  freed: number;
  dryRun: boolean;
  quarantined: boolean;
  durationMs?: number;
}

export interface LifetimeStats {
  totalCleans: number;
  totalRemoved: number;
  totalFreed: number;
  firstCleanAt?: string;
  lastCleanAt?: string;
  perCategory: Record<string, { cleans: number; freed: number; removed: number }>;
  perDayLast30: Record<string, number>; // YYYY-MM-DD → freed bytes
}

const EMPTY_STATS: LifetimeStats = {
  totalCleans: 0,
  totalRemoved: 0,
  totalFreed: 0,
  perCategory: {},
  perDayLast30: {},
};

export function record(row: HistoryRow) {
  try {
    appendFileSync(historyFile(), JSON.stringify(row) + "\n");
  } catch {
    // don't let history failures break a clean
  }
  // Update cached stats lazily by re-aggregating on read; cheap.
}

export function readHistory(): HistoryRow[] {
  const file = historyFile();
  if (!existsSync(file)) return [];
  const txt = readFileSync(file, "utf8");
  const rows: HistoryRow[] = [];
  for (const line of txt.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed line
    }
  }
  return rows;
}

export function aggregate(rows: HistoryRow[] = readHistory()): LifetimeStats {
  const stats: LifetimeStats = JSON.parse(JSON.stringify(EMPTY_STATS));
  const cutoff = Date.now() - 30 * 86400_000;
  for (const r of rows) {
    if (r.dryRun) continue;
    stats.totalCleans++;
    stats.totalRemoved += r.removed;
    stats.totalFreed += r.freed;
    if (!stats.firstCleanAt || r.ts < stats.firstCleanAt) stats.firstCleanAt = r.ts;
    if (!stats.lastCleanAt || r.ts > stats.lastCleanAt) stats.lastCleanAt = r.ts;
    const c = (stats.perCategory[r.category] ??= { cleans: 0, freed: 0, removed: 0 });
    c.cleans++;
    c.freed += r.freed;
    c.removed += r.removed;
    const t = Date.parse(r.ts);
    if (!Number.isNaN(t) && t >= cutoff) {
      const day = new Date(t).toISOString().slice(0, 10);
      stats.perDayLast30[day] = (stats.perDayLast30[day] ?? 0) + r.freed;
    }
  }
  return stats;
}

/** Tiny ASCII sparkline for a list of values. */
export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const max = Math.max(...values, 1);
  return values
    .map((v) => (v <= 0 ? " " : chars[Math.min(chars.length - 1, Math.floor((v / max) * (chars.length - 1)))]))
    .join("");
}

/** Cache the latest stats snapshot for fast dashboard reads. */
export function snapshotStats() {
  try {
    const stats = aggregate();
    writeFileSync(stateFile(), JSON.stringify(stats, null, 2));
    return stats;
  } catch {
    return EMPTY_STATS;
  }
}

export function loadCachedStats(): LifetimeStats {
  try {
    if (!existsSync(stateFile())) return aggregate();
    return JSON.parse(readFileSync(stateFile(), "utf8")) as LifetimeStats;
  } catch {
    return EMPTY_STATS;
  }
}
