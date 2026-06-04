/**
 * Boxed recommendation cards rendered above the main menu.
 *
 *   ┌─ Biggest win ────────────────────────────────────┐
 *   │ system-caches   4.2 GB  ·  125 items             │
 *   │ Largest pile · you've cleaned this 3×            │
 *   └──────────────────────────────────────────────────┘
 */
import { rgb, palette, dim, freed as freedColor, brand } from "./theme.ts";
import { termWidth } from "./tty.ts";
import { human } from "../core/size.ts";
import type { Recommendation } from "../core/recommendations.ts";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function padRight(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - stripAnsi(s).length));
}

export function renderCards(recs: Recommendation[]) {
  if (recs.length === 0) return;
  const w = Math.min(64, termWidth() - 4);
  for (const r of recs) {
    const title = r.kind === "biggest" ? "Biggest win" : "Easiest safe win";
    const titleColor = r.kind === "biggest" ? palette.spark : palette.moss;
    const header = "─ " + rgb(titleColor, title) + " " + "─".repeat(Math.max(2, w - 4 - title.length - 2));
    const line1 = `${brand(r.id.padEnd(20))}  ${freedColor(human(r.size).padStart(8))}  ${dim(`· ${r.count} item(s)`)}`;
    const line2 = dim(r.reason);
    const fmt = (s: string) => `│ ${padRight(s, w - 4)} │`;
    console.log(rgb(titleColor, "┌" + header + "┐"));
    console.log(rgb(titleColor, fmt(line1)));
    console.log(rgb(titleColor, fmt(line2)));
    console.log(rgb(titleColor, "└" + "─".repeat(w - 2) + "┘"));
  }
  console.log();
}
