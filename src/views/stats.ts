/**
 * `burrowed stats` and the Stats screen in the dashboard.
 */
import pc from "picocolors";
import { aggregate, sparkline, readHistory, type LifetimeStats } from "../core/history.ts";
import { human } from "../core/size.ts";
import { brand, dim, sky, freed as freedColor, palette, rgb } from "../ui/theme.ts";

export function renderStats(stats: LifetimeStats = aggregate()) {
  console.log(brand("  Lifetime stats"));
  console.log();
  if (stats.totalCleans === 0) {
    console.log(dim("  No cleans yet. Run `burrowed clean <category>` to get started."));
    console.log();
    return;
  }
  console.log(
    `  ${pc.bold("Total reclaimed")}   ${freedColor(human(stats.totalFreed))}   ${dim(`across ${stats.totalCleans} cleans`)}`,
  );
  console.log(
    `  ${pc.bold("Items removed")}     ${freedColor(String(stats.totalRemoved))}`,
  );
  if (stats.firstCleanAt) {
    console.log(`  ${pc.bold("First clean")}       ${sky(stats.firstCleanAt.slice(0, 10))}`);
  }
  if (stats.lastCleanAt) {
    console.log(`  ${pc.bold("Last clean")}        ${sky(stats.lastCleanAt.slice(0, 10))}`);
  }
  console.log();

  // per-category top-5
  const entries = Object.entries(stats.perCategory).sort((a, b) => b[1].freed - a[1].freed);
  if (entries.length > 0) {
    console.log(dim("  Top categories"));
    const max = entries[0][1].freed;
    for (const [cat, c] of entries.slice(0, 8)) {
      const barLen = Math.max(1, Math.round((c.freed / max) * 24));
      const bar = rgb(palette.moss, "█".repeat(barLen)) + dim("·".repeat(24 - barLen));
      console.log(
        `    ${cat.padEnd(18)} ${bar}  ${freedColor(human(c.freed).padStart(8))}  ${dim(`${c.cleans} cleans`)}`,
      );
    }
    console.log();
  }

  // last-30-day sparkline
  const days: string[] = [];
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(day.getTime() - i * 86400_000);
    days.push(d.toISOString().slice(0, 10));
  }
  const values = days.map((d) => stats.perDayLast30[d] ?? 0);
  const totalLast30 = values.reduce((s, v) => s + v, 0);
  console.log(dim("  Last 30 days"));
  console.log(`    ${rgb(palette.spark, sparkline(values))}  ${freedColor(human(totalLast30))}`);
  console.log();
}

export function renderHistory(limit = 20) {
  const rows = readHistory();
  if (rows.length === 0) {
    console.log(dim("  No history yet."));
    return;
  }
  console.log(brand(`  Last ${Math.min(limit, rows.length)} cleans`));
  console.log();
  for (const r of rows.slice(-limit).reverse()) {
    const tag = r.quarantined ? sky("quarantine") : freedColor("delete");
    console.log(
      `  ${dim(r.ts.replace("T", " ").slice(0, 19))}  ` +
        `${pc.bold(r.category.padEnd(18))}  ` +
        `${tag.padEnd(20)}  ` +
        `${freedColor(human(r.freed).padStart(8))}  ` +
        `${dim(`${r.removed} item(s)`)}`,
    );
  }
  console.log();
}
