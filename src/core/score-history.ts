/**
 * Score-history log. Append-only JSONL beside history.jsonl. Each row
 * is small (the four component scores are abbreviated) so a year of
 * thrice-weekly scores stays well under 100 KB.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appSupportDir } from "./paths.ts";
import type { HealthScore } from "./score.ts";

export interface ScoreEntry {
  ts: string;
  total: number;
  grade: HealthScore["grade"];
  /** Abbreviated components: diskFree / reclaimable / dormantApps / recency. */
  c: { df: number; rc: number; da: number; re: number };
}

function file(): string {
  return join(appSupportDir(), "score-history.jsonl");
}

export function appendScore(score: HealthScore) {
  const row: ScoreEntry = {
    ts: new Date(score.computedAt).toISOString(),
    total: score.total,
    grade: score.grade,
    c: {
      df: Math.round(score.components.diskFree.points),
      rc: Math.round(score.components.reclaimable.points),
      da: Math.round(score.components.dormantApps.points),
      re: Math.round(score.components.recency.points),
    },
  };
  try {
    appendFileSync(file(), JSON.stringify(row) + "\n");
  } catch {
    // history is non-critical
  }
}

export function readScoreHistory(): ScoreEntry[] {
  const f = file();
  if (!existsSync(f)) return [];
  const out: ScoreEntry[] = [];
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return out;
}

/**
 * Last N entries, oldest first. If fewer than N exist, returns all of them.
 * Optionally constrain to entries within `windowDays`.
 */
export function recentEntries(opts: { n?: number; windowDays?: number } = {}): ScoreEntry[] {
  const all = readScoreHistory();
  let arr = all;
  if (opts.windowDays != null) {
    const cutoff = Date.now() - opts.windowDays * 86400_000;
    arr = arr.filter((e) => Date.parse(e.ts) >= cutoff);
  }
  if (opts.n != null && arr.length > opts.n) arr = arr.slice(-opts.n);
  return arr;
}

export interface Trend {
  entries: ScoreEntry[];
  delta: number;
  sparkline: string;
  /** "↗", "↘", "→". */
  arrow: string;
}

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function summarise(entries: ScoreEntry[]): Trend {
  if (entries.length === 0) {
    return { entries, delta: 0, sparkline: "", arrow: "→" };
  }
  // For sparkline we normalise within the visible window so flat-low and
  // flat-high don't both render as solid blocks.
  const values = entries.map((e) => e.total);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(1, hi - lo);
  const sparkline = values
    .map((v) => SPARK_CHARS[Math.min(7, Math.floor(((v - lo) / span) * 7))])
    .join("");
  const delta = entries.length >= 2 ? entries[entries.length - 1].total - entries[0].total : 0;
  const arrow = delta > 1 ? "↗" : delta < -1 ? "↘" : "→";
  return { entries, delta, sparkline, arrow };
}
