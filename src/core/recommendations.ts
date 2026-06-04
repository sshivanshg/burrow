/**
 * Recommendations engine. Looks at the latest cross-category scan plus
 * the user's history and surfaces two cards:
 *
 *   Biggest win   — highest score by `size × historyBias`. Catches the
 *                   "you actually have 4GB sitting in system-caches" case.
 *   Easiest safe  — highest pre-checked-size ratio with non-trivial size.
 *                   The category you can clean with one Enter press.
 *
 * The history bias gently nudges toward categories the user already
 * cleans — habit-aware without being preachy.
 */
import type { Finding } from "./types.ts";
import { loadCachedStats, aggregate, type LifetimeStats } from "./history.ts";

export interface CategoryScan {
  id: string;
  title: string;
  findings: Finding[];
  size: number;
  preSafeSize: number; // sum of sizes for items with f.safe === true
  count: number;
}

export interface Recommendation {
  kind: "biggest" | "easiest";
  id: string;
  title: string;
  size: number;
  count: number;
  reason: string;
  preSafeSize: number;
}

export function buildScans(
  rows: Array<{ id: string; title: string; findings: Finding[] }>,
): CategoryScan[] {
  return rows.map((r) => {
    const size = r.findings.reduce((s, f) => s + f.size, 0);
    const preSafeSize = r.findings.filter((f) => f.safe).reduce((s, f) => s + f.size, 0);
    return { id: r.id, title: r.title, findings: r.findings, size, preSafeSize, count: r.findings.length };
  });
}

export function recommend(
  scans: CategoryScan[],
  stats: LifetimeStats = loadCachedStats(),
): Recommendation[] {
  if (scans.length === 0) return [];
  const totalCleans = Math.max(1, stats.totalCleans);
  const minSize = 50 * 1024 * 1024; // ignore noise below 50 MB

  // Biggest win: size × habit-bias.
  const biggest = scans
    .filter((s) => s.size >= minSize)
    .map((s) => {
      const prior = stats.perCategory[s.id]?.cleans ?? 0;
      const bias = 1 + 0.5 * (prior / totalCleans);
      return { s, score: s.size * bias };
    })
    .sort((a, b) => b.score - a.score)[0];

  // Easiest safe win: highest pre-safe ratio, still material in absolute terms.
  const easiest = scans
    .filter((s) => s.preSafeSize >= minSize)
    .map((s) => ({ s, ratio: s.preSafeSize / Math.max(1, s.size) }))
    .sort((a, b) => b.ratio * b.s.preSafeSize - a.ratio * a.s.preSafeSize)[0];

  const out: Recommendation[] = [];
  if (biggest) {
    out.push({
      kind: "biggest",
      id: biggest.s.id,
      title: biggest.s.title,
      size: biggest.s.size,
      count: biggest.s.count,
      preSafeSize: biggest.s.preSafeSize,
      reason: explainBiggest(biggest.s, stats),
    });
  }
  if (easiest && (!biggest || easiest.s.id !== biggest.s.id)) {
    out.push({
      kind: "easiest",
      id: easiest.s.id,
      title: easiest.s.title,
      size: easiest.s.size,
      count: easiest.s.count,
      preSafeSize: easiest.s.preSafeSize,
      reason: `${Math.round((easiest.s.preSafeSize / Math.max(1, easiest.s.size)) * 100)}% pre-checked safe`,
    });
  }
  return out;
}

function explainBiggest(s: CategoryScan, stats: LifetimeStats): string {
  const prior = stats.perCategory[s.id]?.cleans ?? 0;
  if (prior > 0) return `Largest pile · you've cleaned this ${prior}×`;
  return `Largest reclaimable pile right now`;
}
