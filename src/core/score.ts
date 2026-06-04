/**
 * burrow health score — composite 0–100 across four dimensions, each
 * worth 25 points:
 *
 *   diskFree       % of disk available. 100 when > 30% free, 0 when < 5%.
 *   reclaimable    Bytes burrow can free right now. 100 when < 1 GB, 0 at 30 GB+.
 *   dormantApps    Count of apps idle ≥ 90 days. 100 at 0, 0 at 30+.
 *   recency        How recently you last cleaned. 100 within 7d, 0 at 60d+ / never.
 *
 * The full report is cacheable for the dashboard so we don't re-walk
 * Spotlight on every menu redraw.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diskInfo } from "./disk.ts";
import { aggregate } from "./history.ts";
import { appSupportDir } from "./paths.ts";
import dormantApps from "../cleaners/dormant-apps.ts";

export interface ScoreComponent {
  /** Display name. */
  name: string;
  /** 0–25 contribution. */
  points: number;
  /** Raw measured value (% / bytes / count / days). */
  value: number;
  /** Short explanation. */
  detail: string;
}

export interface HealthScore {
  /** Composite 0–100. */
  total: number;
  /** Letter grade. */
  grade: "A" | "B" | "C" | "D" | "F";
  /** Four sub-components, each /25. */
  components: {
    diskFree: ScoreComponent;
    reclaimable: ScoreComponent;
    dormantApps: ScoreComponent;
    recency: ScoreComponent;
  };
  /** Unix ms when the score was computed. */
  computedAt: number;
}

const SCORE_CACHE = () => join(appSupportDir(), "score.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function clamp(n: number, lo = 0, hi = 25): number {
  return Math.max(lo, Math.min(hi, n));
}

function lerp(value: number, fromBest: number, fromWorst: number, scale = 25): number {
  // Higher value → higher score when fromBest > fromWorst, vice versa.
  if (fromBest === fromWorst) return scale;
  const t = (value - fromWorst) / (fromBest - fromWorst);
  return clamp(t * scale);
}

function gradeFor(total: number): HealthScore["grade"] {
  if (total >= 90) return "A";
  if (total >= 75) return "B";
  if (total >= 60) return "C";
  if (total >= 40) return "D";
  return "F";
}

function scoreDiskFree(): ScoreComponent {
  const d = diskInfo();
  if (!d) return { name: "Disk free", points: 25, value: 0, detail: "(unknown)" };
  const freePct = (d.available / d.total) * 100;
  // 100% sub-score when freePct >= 30, 0 when <= 5.
  const points = lerp(freePct, 30, 5);
  return {
    name: "Disk free",
    points,
    value: freePct,
    detail: `${freePct.toFixed(1)}% free`,
  };
}

function scoreReclaimable(reclaimableBytes: number): ScoreComponent {
  const GB = 1024 * 1024 * 1024;
  // Best at < 1 GB, worst at >= 30 GB. lerp encodes "value's distance
  // from worst end" so passing best=1, worst=30 gives the right direction.
  const points = lerp(reclaimableBytes / GB, 1, 30);
  const gbs = reclaimableBytes / GB;
  return {
    name: "Reclaimable",
    points,
    value: reclaimableBytes,
    detail: `${gbs < 0.1 ? "<0.1" : gbs.toFixed(1)} GB to free`,
  };
}

function scoreDormant(count: number): ScoreComponent {
  // Best at 0 dormant, worst at 30+.
  const points = lerp(count, 0, 30);
  return {
    name: "Dormant apps",
    points,
    value: count,
    detail: count === 0 ? "none" : `${count} idle ≥ 90 d`,
  };
}

function scoreRecency(lastCleanISO: string | undefined): ScoreComponent {
  if (!lastCleanISO) {
    return { name: "Recency", points: 0, value: Infinity, detail: "no cleans yet" };
  }
  const days = (Date.now() - Date.parse(lastCleanISO)) / 86400_000;
  // Best within 7d, worst at 60d+.
  const points = lerp(days, 7, 60);
  return {
    name: "Recency",
    points,
    value: days,
    detail: days < 1 ? "today" : `${Math.floor(days)}d ago`,
  };
}

interface ScoreInputs {
  /** Total bytes burrow could reclaim. If omitted we scan cheap categories. */
  reclaimableBytes?: number;
  /** Count of dormant apps. If omitted we run the dormant-app scan. */
  dormantCount?: number;
}

export async function computeScore(inputs: ScoreInputs = {}): Promise<HealthScore> {
  // Reclaimable: if caller didn't pass one in, scan cheap cleaners.
  let reclaimable = inputs.reclaimableBytes;
  if (reclaimable == null) {
    const { cleaners } = await import("../cleaners/index.ts");
    let total = 0;
    for (const c of cleaners) {
      if (["app-leftovers", "large-files", "duplicates", "dormant-apps"].includes(c.meta.id)) continue;
      try {
        const ok = await Promise.resolve(c.meta.available?.() ?? true);
        if (!ok) continue;
        const f = await c.scan({});
        total += f.reduce((s, x) => s + x.size, 0);
      } catch {
        // skip
      }
    }
    reclaimable = total;
  }

  // Dormant apps: if not provided, run the scan. mdls is fast (~50ms / app)
  // but on a Mac with 200 apps that's 10 s. The caller usually pre-computes.
  let dormantCount = inputs.dormantCount;
  if (dormantCount == null) {
    try {
      const f = await dormantApps.scan({ olderThanDays: 90 });
      dormantCount = f.length;
    } catch {
      dormantCount = 0;
    }
  }

  const stats = aggregate();
  const components = {
    diskFree: scoreDiskFree(),
    reclaimable: scoreReclaimable(reclaimable),
    dormantApps: scoreDormant(dormantCount),
    recency: scoreRecency(stats.lastCleanAt),
  };
  const total = Math.round(
    components.diskFree.points +
      components.reclaimable.points +
      components.dormantApps.points +
      components.recency.points,
  );
  return {
    total,
    grade: gradeFor(total),
    components,
    computedAt: Date.now(),
  };
}

/** Read the cached score if fresh enough; otherwise null. */
export function readCachedScore(maxAgeMs = CACHE_TTL_MS): HealthScore | null {
  try {
    const file = SCORE_CACHE();
    if (!existsSync(file)) return null;
    const score = JSON.parse(readFileSync(file, "utf8")) as HealthScore;
    if (Date.now() - score.computedAt > maxAgeMs) return null;
    return score;
  } catch {
    return null;
  }
}

export function cacheScore(score: HealthScore) {
  try {
    writeFileSync(SCORE_CACHE(), JSON.stringify(score, null, 2));
  } catch {
    // not critical
  }
}
