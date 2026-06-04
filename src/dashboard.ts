/**
 * burrow dashboard — the headline overview screen.
 *
 *   - shows the burrow ASCII banner with a gradient reveal
 *   - runs the Full Disk Access onboarding flow on first run
 *   - shows a live disk-free gradient bar
 *   - scans every available cleaner with a multi-row mole-digging animation
 *   - ranks reclaimable categories with animated gradient bars
 *   - drills into any category via the picker
 */
import pc from "picocolors";
import { select, isCancel, cancel } from "@clack/prompts";
import { cleaners } from "./cleaners/index.ts";
import { diskInfo } from "./core/disk.ts";
import { human } from "./core/size.ts";
import type { Finding } from "./core/types.ts";
import { brand, dim, freed as freedColor, palette, gradient } from "./ui/theme.ts";
import { animateBytes, progressBar } from "./ui/animations.ts";
import { animationsEnabled, termWidth } from "./ui/tty.ts";
import { runCleaner } from "./ui/picker.ts";
import { showBanner } from "./ui/banner.ts";
import { Digger } from "./ui/digger.ts";
import { ensurePermissions } from "./ui/onboarding.ts";
import { checkPermissions } from "./core/permissions.ts";

interface Summary {
  id: string;
  title: string;
  count: number;
  size: number;
  findings: Finding[];
}

async function scanAll(): Promise<Summary[]> {
  const results: Summary[] = [];
  const scannable = cleaners.filter(
    (c) => c.meta.id !== "app-leftovers" && c.meta.id !== "large-files" && c.meta.id !== "duplicates",
  );
  const d = new Digger();
  d.start(`Digging through ${scannable.length} categories…`);
  let done = 0;
  for (const c of scannable) {
    d.setMessage(`Digging through ${c.meta.title}…`);
    d.setProgress(done / scannable.length);
    try {
      const ok = await Promise.resolve(c.meta.available?.() ?? true);
      if (!ok) {
        done++;
        continue;
      }
      const findings = await c.scan({});
      const size = findings.reduce((s, f) => s + f.size, 0);
      if (size > 0 || findings.length > 0) {
        results.push({ id: c.meta.id, title: c.meta.title, count: findings.length, size, findings });
      }
    } catch {
      // skip cleaner that errored — don't break the dashboard
    }
    done++;
  }
  d.setProgress(1);
  d.stop(`Scanned ${scannable.length} categories. Found ${results.length} with reclaimable space.`);
  return results.sort((a, b) => b.size - a.size);
}

function showDiskBar() {
  const d = diskInfo();
  if (!d) return;
  const w = Math.min(48, termWidth() - 24);
  const usedRatio = d.used / d.total;
  console.log(
    `  ${dim("Disk")}  ${progressBar(d.used, d.total, w)}  ${freedColor(human(d.available))} ${dim("free")}`,
  );
  console.log(
    `         ${dim(`${human(d.used)} used of ${human(d.total)} (${(usedRatio * 100).toFixed(0)}%)`)}`,
  );
  console.log();
}

function showSummaryBars(rows: Summary[]) {
  if (rows.length === 0) return;
  const maxSize = Math.max(...rows.map((r) => r.size), 1);
  const labelW = Math.min(28, Math.max(...rows.map((r) => r.id.length)) + 2);
  const barW = Math.min(36, termWidth() - labelW - 28);
  for (const r of rows) {
    const bar = progressBar(r.size, maxSize, barW);
    console.log(
      `  ${pc.bold(r.id.padEnd(labelW))}${bar}  ${freedColor(human(r.size).padStart(8))}  ${dim(`${r.count} item(s)`)}`,
    );
  }
  console.log();
}

export async function runDashboard() {
  if (animationsEnabled()) console.clear();
  await showBanner();

  // First-run permission gate.
  await ensurePermissions();

  showDiskBar();

  const rows = await scanAll();
  const total = rows.reduce((s, r) => s + r.size, 0);

  console.log();
  console.log("  " + gradient("Reclaimable by category", palette.dirt, palette.spark));
  console.log();
  showSummaryBars(rows);

  if (animationsEnabled() && total > 0) {
    await animateBytes({
      to: total,
      ms: 900,
      render: (_, str) => process.stdout.write("\r  " + brand(`Total reclaimable: ${str}`) + "    "),
    });
    process.stdout.write("\n\n");
  } else {
    console.log("  Total reclaimable: " + human(total) + "\n");
  }

  if (rows.length === 0) {
    console.log(pc.green("  ✨ You're tidy — nothing to clean.\n"));
    return;
  }

  const choice = await select({
    message: "Pick a category to clean (or press Esc to exit):",
    options: [
      ...rows.map((r) => ({
        value: r.id,
        label: `${pc.bold(r.title.padEnd(36))}  ${freedColor(human(r.size).padStart(8))}  ${dim(`${r.count} item(s)`)}`,
      })),
      { value: "_exit", label: dim("Exit") },
    ],
  });

  if (isCancel(choice) || choice === "_exit") {
    cancel("See you next time.");
    return;
  }

  const cleaner = cleaners.find((c) => c.meta.id === choice)!;
  await runCleaner({
    cleaner,
    scanOpts: {},
    dryRun: false,
    json: false,
    list: false,
    yes: false,
  });
}
