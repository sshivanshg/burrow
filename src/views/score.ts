/**
 * Score rendering — a big graded card with sub-component bars.
 *
 *   ┌─ burrow score ───────────────────────────────────┐
 *   │                                                  │
 *   │       82  B                                      │
 *   │       ──                                         │
 *   │       /100                                       │
 *   │                                                  │
 *   │   Disk free      ████████████████████░░  25/25   │
 *   │   Reclaimable    ██████████████░░░░░░░░  18/25   │
 *   │   Dormant apps   ████████████████░░░░░░  20/25   │
 *   │   Recency        ███████████████░░░░░░░  19/25   │
 *   │                                                  │
 *   └──────────────────────────────────────────────────┘
 *
 * Also exposes inlineBadge() for use in the dashboard header.
 */
import { rgb, palette, dim, brand, freed as freedColor } from "../ui/theme.ts";
import { termWidth } from "../ui/tty.ts";
import type { HealthScore, ScoreComponent } from "../core/score.ts";
import { recentEntries, summarise, type Trend } from "../core/score-history.ts";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
function padRight(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - stripAnsi(s).length));
}

function gradeColor(grade: HealthScore["grade"]) {
  if (grade === "A") return palette.moss;
  if (grade === "B") return palette.sky;
  if (grade === "C") return palette.spark;
  return palette.danger;
}

function bar(points: number, width: number): string {
  const filled = Math.round((points / 25) * width);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}

function rowFor(c: ScoreComponent): string {
  const points = Math.round(c.points);
  const bw = 22;
  const color = points >= 20 ? palette.moss : points >= 12 ? palette.spark : palette.danger;
  const barStr = rgb(color, bar(points, bw));
  return `${c.name.padEnd(14)}${barStr}  ${points}/25  ${dim(`· ${c.detail}`)}`;
}

export function renderScoreCard(score: HealthScore) {
  const w = Math.min(60, termWidth() - 4);
  const color = gradeColor(score.grade);
  console.log(rgb(color, "┌─ ") + brand("burrow score") + rgb(color, " " + "─".repeat(w - 18) + "┐"));
  const blank = rgb(color, `│ ${" ".repeat(w - 4)} │`);
  console.log(blank);

  const big = `${score.total}`;
  const grade = score.grade;
  const headline = `${rgb(color, "  " + big)} ${rgb(color, grade)}    ${dim(`/100`)}`;
  console.log(rgb(color, "│ ") + padRight(headline, w - 4) + rgb(color, " │"));
  console.log(blank);

  for (const c of [
    score.components.diskFree,
    score.components.reclaimable,
    score.components.dormantApps,
    score.components.recency,
  ]) {
    const line = "  " + rowFor(c);
    console.log(rgb(color, "│ ") + padRight(line, w - 4) + rgb(color, " │"));
  }
  console.log(blank);
  console.log(rgb(color, "└" + "─".repeat(w - 2) + "┘"));
}

/** Compact one-liner used inside the dashboard header. */
export function inlineBadge(score: HealthScore): string {
  const color = gradeColor(score.grade);
  return rgb(color, `${score.total} ${score.grade}`) + dim(`/100`);
}

/**
 * One-line trend strip rendered under the score card. Looks like:
 *
 *   30d trend  ▃▃▅▆▇█  22 → 58   ↗ +36
 *
 * Returns empty string when there's no history (just printed first card).
 */
export function renderTrend(windowDays = 30): string {
  const entries = recentEntries({ windowDays, n: 40 });
  if (entries.length < 2) {
    if (entries.length === 1) {
      return dim(`  Trend  ${entries[0].total} · keep using burrow to build a trend.`);
    }
    return "";
  }
  const t = summarise(entries);
  const first = entries[0].total;
  const last = entries[entries.length - 1].total;
  const deltaStr = t.delta === 0 ? "no change" : (t.delta > 0 ? `+${t.delta}` : `${t.delta}`);
  const arrowColor = t.delta > 0 ? palette.moss : t.delta < 0 ? palette.danger : palette.shadow;
  const sparkColor = palette.spark;
  return `  ${dim(`${windowDays}d trend`)}  ${rgb(sparkColor, t.sparkline)}  ${first} → ${last}   ${rgb(arrowColor, t.arrow + " " + deltaStr)}`;
}

/** Quick textual one-liner with suggestion. */
export function nudge(score: HealthScore): string {
  const worst = Object.values(score.components).sort((a, b) => a.points - b.points)[0];
  const fix: Record<string, string> = {
    "Disk free": "run Clean to free space",
    Reclaimable: "run Clean → start with Biggest win",
    "Dormant apps": "open Uninstall → Dormant apps",
    Recency: "run any Clean to refresh recency",
  };
  return `Weakest: ${dim(worst.name)} (${Math.round(worst.points)}/25). ${dim("Try: " + (fix[worst.name] ?? "Clean"))}`;
}
