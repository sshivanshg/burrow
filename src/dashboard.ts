/**
 * burrowed dashboard — the Mole-style top-level menu.
 *
 * Layout (matches Mole's actual screen):
 *   - compact figlet logo, URL + tagline on the right
 *   - update notice (if applicable)
 *   - 5-item numbered menu with ▸ on the active row
 *   - footer keybinding hints
 *
 * Picking an item either runs a flow (Clean/Uninstall/Analyze/Status)
 * or loops back to the menu.
 */
import pc from "picocolors";
import { cleaners, byId } from "./cleaners/index.ts";
import { diskInfo } from "./core/disk.ts";
import { human } from "./core/size.ts";
import type { Finding } from "./core/types.ts";
import { rgb, palette, dim, brand, freed as freedColor } from "./ui/theme.ts";
import { Digger } from "./ui/digger.ts";
import { animationsEnabled } from "./ui/tty.ts";
import { runCleaner } from "./ui/picker.ts";
import { showBanner } from "./ui/banner.ts";
import { showMenu, type MenuItem } from "./ui/menu.ts";
import { ensurePermissions } from "./ui/onboarding.ts";
import appLeftovers from "./cleaners/app-leftovers.ts";
import largeFiles from "./cleaners/large-files.ts";
import duplicates from "./cleaners/duplicates.ts";
import { renderStats, renderHistory } from "./views/stats.ts";
import { listQuarantine, restoreById, purgeAll } from "./views/quarantine.ts";
import { status as scheduleStatus, install as installSchedule, uninstall as uninstallSchedule, type Cadence } from "./core/schedule.ts";
import { runOptimize } from "./views/optimize.ts";
import { buildScans, recommend } from "./core/recommendations.ts";
import { renderCards } from "./ui/cards.ts";
import dormantApps from "./cleaners/dormant-apps.ts";
import { computeScore, readCachedScore, cacheScore } from "./core/score.ts";
import { renderScoreCard, inlineBadge, nudge, renderTrend } from "./views/score.ts";
import { appendScore } from "./core/score-history.ts";
import { TopBar } from "./ui/topbar.ts";

const MAIN_MENU: MenuItem[] = [
  { value: "clean", label: "Clean", description: "Free up disk space" },
  { value: "uninstall", label: "Uninstall", description: "Remove apps · dormant detection" },
  { value: "optimize", label: "Optimize", description: "Privileged tune-ups (TouchID)" },
  { value: "analyze", label: "Analyze", description: "Explore disk usage" },
  { value: "score", label: "Score", description: "Composite 0-100 health score" },
  { value: "status", label: "Status", description: "Disk overview + reclaimable" },
  { value: "stats", label: "Stats", description: "Lifetime reclaimed + history" },
  { value: "quarantine", label: "Quarantine", description: "Soft-deleted items · restore / purge" },
  { value: "schedule", label: "Schedule", description: "Automate cleanups via launchd" },
  { value: "doctor", label: "Doctor", description: "Check available cleaners" },
];

const CLEAN_MENU_BASE: MenuItem[] = [
  { value: "dev-junk", label: "Dev junk", description: "node_modules, .next, caches" },
  { value: "system-caches", label: "App caches", description: "~/Library/Caches" },
  { value: "xcode", label: "Xcode", description: "DerivedData, archives, simulators" },
  { value: "homebrew", label: "Homebrew", description: "brew cleanup -s + caches" },
  { value: "docker", label: "Docker", description: "Images, volumes, build cache" },
  { value: "browsers", label: "Browsers", description: "Cache only — never history" },
  { value: "downloads", label: "Downloads", description: "Old files in ~/Downloads" },
  { value: "trash", label: "Trash", description: "Items in ~/.Trash" },
  { value: "logs", label: "Logs", description: "Old files in ~/Library/Logs" },
  { value: "mail-attachments", label: "Attachments", description: "Mail + iMessage cache" },
  { value: "back", label: "Back", description: "Return to main menu" },
];

const ANALYZE_MENU: MenuItem[] = [
  { value: "large-files", label: "Large files", description: "Biggest individual files" },
  { value: "duplicates", label: "Duplicates", description: "Hash-based duplicate finder" },
  { value: "back", label: "Back", description: "Return to main menu" },
];

function clearScreen() {
  if (animationsEnabled()) console.clear();
}

function printHeader() {
  clearScreen();
  showBanner();
}

async function runClean() {
  printHeader();
  console.log(dim("  Clean — pick a category to free up disk space.\n"));
  const choice = await showMenu({ items: CLEAN_MENU_BASE });
  if (!choice || choice === "back") return;
  const cleaner = byId(choice);
  if (!cleaner) return;
  console.log();
  await runCleaner({
    cleaner,
    scanOpts: {},
    dryRun: false,
    json: false,
    list: false,
    yes: false,
  });
  await pressAnyKey();
}

async function runUninstall() {
  printHeader();
  console.log(dim("  Uninstall — remove apps and their leftover files.\n"));
  const pick = await showMenu({
    items: [
      { value: "by-name", label: "By name", description: "Type an app name to find its leftovers" },
      { value: "dormant", label: "Dormant apps", description: "Apps you haven't opened in 90+ days" },
      { value: "back", label: "Back", description: "Return to main menu" },
    ],
  });
  if (!pick || pick === "back") return;
  if (pick === "by-name") {
    const app = await readLine("  App name (e.g. Slack): ");
    if (!app) return;
    console.log();
    await runCleaner({
      cleaner: appLeftovers,
      scanOpts: { appName: app },
      dryRun: false,
      json: false,
      list: false,
      yes: false,
    });
  } else if (pick === "dormant") {
    console.log();
    await runCleaner({
      cleaner: dormantApps,
      scanOpts: { olderThanDays: 90 },
      dryRun: false,
      json: false,
      list: false,
      yes: false,
    });
  }
  await pressAnyKey();
}

async function runOptimizeView() {
  printHeader();
  await runOptimize();
  await pressAnyKey();
}

async function runScoreView() {
  printHeader();
  const bar = new TopBar();
  bar.start("Computing burrowed score…");
  const score = await computeScore();
  cacheScore(score);
  appendScore(score);
  bar.stop("Score ready.");
  console.log();
  renderScoreCard(score);
  console.log();
  const trend = renderTrend(30);
  if (trend) {
    console.log(trend);
    console.log();
  }
  console.log("  " + nudge(score));
  await pressAnyKey();
}

async function runAnalyze() {
  printHeader();
  console.log(dim("  Analyze — explore where your disk is going.\n"));
  const choice = await showMenu({ items: ANALYZE_MENU });
  if (!choice || choice === "back") return;
  const cleaner = choice === "large-files" ? largeFiles : duplicates;
  const root = (await readLine("  Path to analyze [~]: ")) || process.env.HOME;
  console.log();
  await runCleaner({
    cleaner,
    scanOpts: { root, depth: 4, minMB: choice === "large-files" ? 100 : 1 },
    dryRun: false,
    json: false,
    list: false,
    yes: false,
    displayRoot: root,
  });
  await pressAnyKey();
}

async function runStatus() {
  printHeader();
  console.log(dim("  Status — system health at a glance.\n"));
  const d = diskInfo();
  if (d) {
    const ratio = d.used / d.total;
    const bar = renderInlineBar(ratio, 36);
    console.log(`  ${pc.bold("Disk")}          ${bar}  ${freedColor(human(d.available))} ${dim("free")}`);
    console.log(`  ${dim(`              ${human(d.used)} used of ${human(d.total)} (${(ratio * 100).toFixed(0)}%)`)}`);
    console.log();
  }
  // Quick reclaimable scan across the auto-scanning cleaners.
  const dg = new Digger();
  dg.start("Scanning categories for reclaimable space…");
  let total = 0;
  const rows: Array<{ id: string; size: number; count: number }> = [];
  for (const c of cleaners) {
    if (["app-leftovers", "large-files", "duplicates"].includes(c.meta.id)) continue;
    const ok = await Promise.resolve(c.meta.available?.() ?? true);
    if (!ok) continue;
    try {
      const findings: Finding[] = await c.scan({});
      const size = findings.reduce((s, f) => s + f.size, 0);
      total += size;
      if (size > 0) rows.push({ id: c.meta.id, size, count: findings.length });
    } catch {
      // skip
    }
  }
  dg.stop(`Found ${rows.length} categor${rows.length === 1 ? "y" : "ies"} with reclaimable space.`);
  console.log();
  rows.sort((a, b) => b.size - a.size);
  for (const r of rows) {
    console.log(`  ${pc.bold(r.id.padEnd(18))}  ${freedColor(human(r.size).padStart(8))}  ${dim(`${r.count} item(s)`)}`);
  }
  console.log();
  console.log(`  ${brand("Total reclaimable")}: ${freedColor(human(total))}`);
  await pressAnyKey();
}

async function runDoctor() {
  printHeader();
  console.log(dim("  Doctor — cleaner availability on this machine.\n"));
  for (const c of cleaners) {
    const ok = await Promise.resolve(c.meta.available?.() ?? true);
    const mark = ok ? rgb(palette.moss, "✓") : rgb(palette.spark, "○");
    console.log(`  ${mark} ${c.meta.id.padEnd(18)} ${dim(c.meta.title)}`);
  }
  console.log();
  console.log(dim("  ✓ available · ○ skipped (tool not installed or path missing)"));
  await pressAnyKey();
}

function renderInlineBar(ratio: number, width: number): string {
  const w = Math.max(8, width);
  const filled = Math.round(ratio * w);
  const empty = w - filled;
  const filledColor = ratio > 0.85 ? palette.danger : ratio > 0.6 ? palette.spark : palette.moss;
  return rgb(filledColor, "█".repeat(filled)) + dim("░".repeat(empty));
}

async function pressAnyKey() {
  if (!process.stdin.isTTY) return;
  console.log();
  console.log(dim("  Press any key to return to the menu…"));
  await new Promise<void>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    const onData = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      resolve();
    };
    stdin.on("data", onData);
  });
}

async function readLine(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  return await new Promise<string>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(false);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (chunk: string) => {
      buf += chunk;
      if (buf.includes("\n")) {
        stdin.removeListener("data", onData);
        stdin.setRawMode(wasRaw);
        stdin.pause();
        resolve(buf.replace(/\n$/, "").trim());
      }
    };
    stdin.on("data", onData);
  });
}

/**
 * Run a quick, cheap scan of just the auto-scanning cleaners so we can
 * compute recommendation cards. Skipped when stdout isn't a TTY.
 *
 * Uses the persistent TopBar so the banner stays visible while the
 * mole tunnels across the top.
 */
async function quickScanForRecs() {
  if (!animationsEnabled()) return [] as Awaited<ReturnType<typeof buildScans>>;
  const cheap = cleaners.filter(
    (c) => !["app-leftovers", "large-files", "duplicates", "dormant-apps"].includes(c.meta.id),
  );
  const bar = new TopBar();
  bar.start("Sniffing around for quick wins…");
  const rows: Array<{ id: string; title: string; findings: Finding[] }> = [];
  for (let i = 0; i < cheap.length; i++) {
    const c = cheap[i];
    bar.setProgress((i + 1) / cheap.length);
    bar.setMessage(`Sampling ${c.meta.title}…`);
    try {
      const ok = await Promise.resolve(c.meta.available?.() ?? true);
      if (!ok) continue;
      const findings = await c.scan({});
      if (findings.length > 0) rows.push({ id: c.meta.id, title: c.meta.title, findings });
    } catch {
      // ignore
    }
  }
  bar.stop(`Done sniffing · ${rows.length} categor${rows.length === 1 ? "y" : "ies"} with reclaimable space.`);
  return buildScans(rows);
}

export async function runDashboard() {
  await ensurePermissions();
  let recs: ReturnType<typeof recommend> = [];
  let firstRun = true;
  while (true) {
    printHeader();
    if (firstRun) {
      const scans = await quickScanForRecs();
      recs = recommend(scans);
      // Compute score off the same scan data + a quick dormant count so the
      // dashboard doesn't trigger a separate Spotlight pass.
      const reclaimableBytes = scans.reduce((s, c) => s + c.size, 0);
      try {
        const dormantList = await dormantApps.scan({ olderThanDays: 90 });
        const fresh = await computeScore({
          reclaimableBytes,
          dormantCount: dormantList.length,
        });
        cacheScore(fresh);
        appendScore(fresh);
      } catch {
        // ignore — badge falls back to cached or hidden
      }
      firstRun = false;
    }
    const cachedScore = readCachedScore();
    if (cachedScore) {
      console.log(`  ${dim("score")}  ${inlineBadge(cachedScore)}`);
      console.log();
    }
    renderCards(recs);
    const choice = await showMenu({ items: MAIN_MENU });
    if (!choice) {
      console.log(dim("\n  bye 🐹\n"));
      return;
    }
    if (choice === "clean") await runClean();
    else if (choice === "uninstall") await runUninstall();
    else if (choice === "optimize") await runOptimizeView();
    else if (choice === "analyze") await runAnalyze();
    else if (choice === "score") await runScoreView();
    else if (choice === "status") await runStatus();
    else if (choice === "stats") await runStats();
    else if (choice === "quarantine") await runQuarantine();
    else if (choice === "schedule") await runSchedule();
    else if (choice === "doctor") await runDoctor();
  }
}

async function runStats() {
  printHeader();
  renderStats();
  console.log(dim("  ── Recent cleans ──"));
  console.log();
  renderHistory(10);
  await pressAnyKey();
}

async function runQuarantine() {
  printHeader();
  console.log(dim("  Quarantine — soft-deleted items.\n"));
  const batches = listQuarantine();
  if (batches.length === 0) {
    await pressAnyKey();
    return;
  }
  const action = await showMenu({
    items: [
      { value: "restore-pick", label: "Restore one", description: "Pick a batch to bring back" },
      { value: "purge-old", label: "Purge old", description: "Remove batches older than 14 days" },
      { value: "purge-all", label: "Purge all", description: "Permanently empty quarantine" },
      { value: "back", label: "Back", description: "Return to main menu" },
    ],
  });
  if (!action || action === "back") return;
  if (action === "restore-pick") {
    const items = batches.slice(0, 9).map((b) => ({
      value: b.id,
      label: b.id.split("_")[0].slice(0, 19),
      description: `${b.category} · ${b.items.length} item(s)`,
    }));
    items.push({ value: "back", label: "Back", description: "" });
    const pick = await showMenu({ items });
    if (pick && pick !== "back") restoreById(pick);
  } else if (action === "purge-old") {
    purgeAll(14);
  } else if (action === "purge-all") {
    purgeAll();
  }
  await pressAnyKey();
}

async function runSchedule() {
  printHeader();
  const s = scheduleStatus();
  console.log(dim("  Schedule — automate burrowed via launchd.\n"));
  console.log(`  Status: ${s.installed ? rgb(palette.moss, "installed") : dim("not installed")}`);
  if (s.installed) console.log(dim(`  plist:  ${s.plistPath}`));
  console.log();
  const items: MenuItem[] = [
    { value: "daily", label: "Daily", description: "Run every day at 03:00 (dev-junk, system-caches, homebrew, logs)" },
    { value: "weekly", label: "Weekly", description: "Run Sundays at 03:00 (same defaults)" },
    { value: "monthly", label: "Monthly", description: "Run on the 1st at 03:00 (same defaults)" },
    ...(s.installed ? [{ value: "uninstall", label: "Remove", description: "Disable the scheduled job" }] : []),
    { value: "back", label: "Back", description: "Return to main menu" },
  ];
  const pick = await showMenu({ items });
  if (!pick || pick === "back") return;
  if (pick === "uninstall") {
    const r = uninstallSchedule();
    console.log(r.removed ? rgb(palette.moss, "  ✓ schedule removed.") : dim("  no schedule installed."));
  } else {
    const r = installSchedule(pick as Cadence, ["dev-junk", "system-caches", "homebrew", "logs"]);
    console.log(
      r.loaded
        ? rgb(palette.moss, `  ✓ scheduled ${pick}. Runs in the background at 03:00.`)
        : dim(`  ⚠ plist written but launchctl reported a problem: ${r.plistPath}`),
    );
  }
  await pressAnyKey();
}
