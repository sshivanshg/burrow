#!/usr/bin/env bun
/**
 * burrow CLI entry. Routes subcommands to handlers.
 *
 *   burrow                          interactive dashboard
 *   burrow scan [path]              scan dev-junk under `path` (default cwd)
 *   burrow clean <category> [path]  pick + clean by category
 *   burrow uninstall <app>          hunt leftovers for a removed app
 *   burrow dashboard                same as `burrow` with no args
 *   burrow doctor                   sanity-check guardrails + tool availability
 *   burrow stats                    lifetime reclaimed stats + sparkline
 *   burrow history                  last 20 cleans
 *   burrow restore [id|--all]       restore quarantined items
 *   burrow purge-quarantine [--older-than 14]
 *   burrow watch [--threshold 85] [--interval 60]
 *   burrow schedule <daily|weekly|monthly> [--categories dev-junk,system-caches]
 *   burrow unschedule
 *   burrow --help
 */
import pc from "picocolors";
import { intro, outro } from "@clack/prompts";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { byId, listIds, cleaners } from "./cleaners/index.ts";
import appLeftovers from "./cleaners/app-leftovers.ts";
import devJunk from "./cleaners/dev-junk.ts";
import { runDashboard } from "./dashboard.ts";
import { runCleaner } from "./ui/picker.ts";
import { reveal } from "./ui/animations.ts";
import { brand, dim, sky, freed as freedColor } from "./ui/theme.ts";
import { setAnimationEnabled, installCursorGuard } from "./ui/tty.ts";
import { renderStats, renderHistory } from "./views/stats.ts";
import { listQuarantine, restoreById, purgeAll } from "./views/quarantine.ts";
import { listBatches } from "./core/quarantine.ts";
import { watch as runWatch } from "./core/watch.ts";
import { install as installSchedule, uninstall as uninstallSchedule, status as scheduleStatus, type Cadence } from "./core/schedule.ts";

/** Burned in at build time. Bump via `bun run release patch|minor|major`. */
export const BURROW_VERSION = "0.2.4";

interface Flags {
  command: string;
  positional: string[];
  dryRun: boolean;
  list: boolean;
  help: boolean;
  version: boolean;
  json: boolean;
  yes: boolean;
  quiet: boolean;
  noAnimation: boolean;
  quarantine: boolean;
  all: boolean;
  depth: number;
  minMB: number;
  olderThan: number;
  threshold: number;
  intervalSec: number;
  categories?: string;
}

const KNOWN_COMMANDS = new Set([
  "scan", "clean", "uninstall", "dashboard", "doctor",
  "stats", "history", "restore", "purge-quarantine",
  "watch", "schedule", "unschedule", "score",
]);

export function parseArgs(argv: string[]): Flags {
  const f: Flags = {
    command: "",
    positional: [],
    dryRun: false,
    list: false,
    help: false,
    version: false,
    json: false,
    yes: false,
    quiet: false,
    noAnimation: false,
    quarantine: false,
    all: false,
    depth: 6,
    minMB: 0,
    olderThan: 90,
    threshold: 85,
    intervalSec: 60,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "-n") f.dryRun = true;
    else if (a === "--list" || a === "-l") f.list = true;
    else if (a === "--help" || a === "-h") f.help = true;
    else if (a === "--version" || a === "-V") f.version = true;
    else if (a === "--json") f.json = true;
    else if (a === "--yes" || a === "-y") f.yes = true;
    else if (a === "--quiet" || a === "-q") f.quiet = true;
    else if (a === "--no-animation") f.noAnimation = true;
    else if (a === "--quarantine") f.quarantine = true;
    else if (a === "--all") f.all = true;
    else if (a === "--depth") f.depth = Number(argv[++i]);
    else if (a === "--min") f.minMB = Number(argv[++i]);
    else if (a === "--older-than") f.olderThan = Number(argv[++i]);
    else if (a === "--threshold") f.threshold = Number(argv[++i]);
    else if (a === "--interval") f.intervalSec = Number(argv[++i]);
    else if (a === "--categories") f.categories = argv[++i];
    else if (a.startsWith("-")) { /* ignore unknown */ }
    else if (!f.command && KNOWN_COMMANDS.has(a)) f.command = a;
    else f.positional.push(a);
  }
  return f;
}

export function printHelp() {
  console.log(`
${brand("🐹 burrow")} ${pc.dim("— dig out junk and reclaim disk space")}

${pc.bold("USAGE")}
  burrow                          Interactive dashboard
  burrow scan [path]              Scan dev-junk under [path] (default: cwd)
  burrow clean <category> [path]  Clean by category (${listIds().join(", ")})
  burrow uninstall <app>          Hunt leftover files for an uninstalled app
  burrow dashboard                Same as \`burrow\` with no args
  burrow doctor                   Sanity-check cleaner availability

  burrow score                    Composite 0-100 health score
  burrow stats                    Lifetime reclaimed + sparkline
  burrow history                  Last 20 cleans
  burrow restore [id|--all]       Restore quarantined items
  burrow purge-quarantine [--older-than 14]

  burrow watch [--threshold 85] [--interval 60]
  burrow schedule <daily|weekly|monthly> [--categories a,b,c]
  burrow unschedule

${pc.bold("OPTIONS")}
  -h, --help           Show this help
  -V, --version        Print version and exit
  -l, --list           Print findings and exit (no prompts)
  -n, --dry-run        Walk the picker but never delete
  -y, --yes            Skip confirmations (only with \`clean <category>\`)
      --quarantine     Move to ~/.burrow-quarantine instead of \`rm\` (undoable)
      --json           Machine-readable output (disables animations)
      --no-animation   Plain output, no spinners or particles
  -q, --quiet          Minimal output
      --depth <n>      Max folder depth (default 6)
      --min <MB>       Hide items smaller than this many MB
      --older-than <d> Age threshold in days (downloads/logs/purge)
      --threshold <%>  Disk-fill % at which \`watch\` notifies (default 85)
      --interval <s>   \`watch\` poll interval in seconds (default 60)
      --categories <l> Comma-separated list of categories for \`schedule\`

${pc.bold("EXAMPLES")}
  burrow                              ${pc.dim("# dashboard")}
  burrow scan ~/Projects              ${pc.dim("# scan dev-junk under ~/Projects")}
  burrow clean dev-junk -y --quarantine   ${pc.dim("# undoable bulk clean")}
  burrow restore 2026-06-04T17-30-12-123Z_dev-junk
  burrow watch --threshold 90 --interval 300
  burrow schedule weekly --categories dev-junk,system-caches,homebrew
`);
}

function resolveRoot(p: string | undefined): string {
  if (!p) return process.cwd();
  return resolve(p.replace(/^~/, homedir()));
}

export async function main(argv: string[]) {
  installCursorGuard();
  const flags = parseArgs(argv);
  if (flags.noAnimation || flags.json) setAnimationEnabled(false);

  if (flags.help) {
    printHelp();
    return;
  }

  if (flags.version) {
    const arch = process.arch;
    const platform = process.platform;
    const runtime = typeof Bun !== "undefined" ? `bun ${Bun.version}` : `node ${process.version}`;
    console.log(`${brand("burrow")} ${BURROW_VERSION}`);
    console.log(dim(`  runtime  ${runtime}`));
    console.log(dim(`  platform ${platform}-${arch}`));
    console.log(dim(`  source   https://github.com/sshivanshg/burrow`));
    return;
  }

  if (!flags.command || flags.command === "dashboard") {
    await runDashboard();
    return;
  }

  if (flags.command === "scan") {
    if (!flags.json) {
      console.clear();
      intro(pc.bgMagenta(pc.black(" 🐹 burrow ")));
    }
    const root = resolveRoot(flags.positional[0]);
    if (!flags.json) console.log(`  ${dim("Scanning")} ${sky(root)} ${dim(`(depth ${flags.depth})`)}\n`);
    const result = await runCleaner({
      cleaner: devJunk,
      scanOpts: { root, depth: flags.depth, minMB: flags.minMB },
      dryRun: flags.dryRun,
      json: flags.json,
      list: flags.list,
      yes: flags.yes,
      quarantine: flags.quarantine,
      displayRoot: root,
    });
    if (!flags.json && result.ran && result.freed > 0) {
      outro(brand(`✨ Reclaimed ${result.freed} bytes`));
    }
    return;
  }

  if (flags.command === "clean") {
    const id = flags.positional[0];
    if (!id) {
      console.error("burrow clean: missing <category>. Try: " + listIds().join(", "));
      process.exit(2);
    }
    const c = byId(id);
    if (!c) {
      console.error(`Unknown category: ${id}. Known: ${listIds().join(", ")}`);
      process.exit(2);
    }
    if (!flags.json) {
      console.clear();
      intro(pc.bgMagenta(pc.black(` 🐹 burrow · ${c.meta.id} `)));
    }
    const root = ["dev-junk", "large-files", "duplicates"].includes(c.meta.id)
      ? resolveRoot(flags.positional[1])
      : undefined;
    await runCleaner({
      cleaner: c,
      scanOpts: {
        root,
        depth: flags.depth,
        minMB: flags.minMB,
        olderThanDays: flags.olderThan,
      },
      dryRun: flags.dryRun,
      json: flags.json,
      list: flags.list,
      yes: flags.yes,
      quarantine: flags.quarantine,
      displayRoot: root,
    });
    return;
  }

  if (flags.command === "uninstall") {
    const app = flags.positional[0];
    if (!app) {
      console.error("burrow uninstall: missing <app>. Example: burrow uninstall Slack");
      process.exit(2);
    }
    if (!flags.json) {
      console.clear();
      intro(pc.bgMagenta(pc.black(` 🐹 burrow · uninstall ${app} `)));
    }
    await runCleaner({
      cleaner: appLeftovers,
      scanOpts: { appName: app },
      dryRun: flags.dryRun,
      json: flags.json,
      list: flags.list,
      yes: flags.yes,
      quarantine: flags.quarantine,
    });
    return;
  }

  if (flags.command === "doctor") {
    await reveal("🩺 burrow doctor");
    console.log();
    for (const c of cleaners) {
      const ok = await Promise.resolve(c.meta.available?.() ?? true);
      const mark = ok ? pc.green("✓") : pc.yellow("○");
      console.log(`  ${mark} ${c.meta.id.padEnd(18)} ${pc.dim(c.meta.title)}`);
    }
    console.log();
    console.log(dim("  ✓ available · ○ skipped (tool not installed or path missing)"));
    return;
  }

  if (flags.command === "score") {
    const { computeScore, cacheScore } = await import("./core/score.ts");
    const { renderScoreCard, renderTrend, nudge } = await import("./views/score.ts");
    const { appendScore } = await import("./core/score-history.ts");
    const score = await computeScore();
    cacheScore(score);
    appendScore(score);
    if (flags.json) {
      console.log(JSON.stringify(score, null, 2));
      return;
    }
    console.log();
    renderScoreCard(score);
    console.log();
    const trend = renderTrend(30);
    if (trend) {
      console.log(trend);
      console.log();
    }
    console.log("  " + nudge(score));
    console.log();
    return;
  }

  if (flags.command === "stats") {
    if (flags.json) {
      const { aggregate } = await import("./core/history.ts");
      console.log(JSON.stringify(aggregate(), null, 2));
      return;
    }
    renderStats();
    return;
  }

  if (flags.command === "history") {
    renderHistory(flags.positional[0] ? Number(flags.positional[0]) : 20);
    return;
  }

  if (flags.command === "restore") {
    const batches = listBatches();
    if (flags.all) {
      let ok = 0;
      for (const b of batches) {
        const okOne = restoreById(b.id);
        if (okOne) ok++;
      }
      console.log(`  Restored ${freedColor(String(ok))}/${batches.length} batch(es).`);
      return;
    }
    const id = flags.positional[0];
    if (!id) {
      listQuarantine();
      console.log(dim("  Usage: burrow restore <id>   or   burrow restore --all"));
      return;
    }
    restoreById(id);
    return;
  }

  if (flags.command === "purge-quarantine") {
    purgeAll(flags.olderThan ? flags.olderThan : undefined);
    return;
  }

  if (flags.command === "watch") {
    await runWatch({ thresholdPercent: flags.threshold, intervalSec: flags.intervalSec });
    return;
  }

  if (flags.command === "schedule") {
    const cad = flags.positional[0] as Cadence | undefined;
    if (!cad || !["daily", "weekly", "monthly"].includes(cad)) {
      console.error("burrow schedule: cadence must be 'daily', 'weekly', or 'monthly'.");
      process.exit(2);
    }
    const categories = flags.categories
      ? flags.categories.split(",").map((s) => s.trim()).filter(Boolean)
      : ["dev-junk", "system-caches", "homebrew", "logs"];
    const r = installSchedule(cad, categories);
    console.log(
      `  ${r.loaded ? pc.green("✓") : pc.yellow("○")} schedule installed: ${cad}, categories=${categories.join(",")}`,
    );
    console.log(dim(`  plist: ${r.plistPath}`));
    console.log(dim(`  log:   ~/Library/Logs/burrow-schedule.log`));
    return;
  }

  if (flags.command === "unschedule") {
    const r = uninstallSchedule();
    if (r.removed) console.log(`  ${pc.green("✓")} schedule removed.`);
    else console.log(dim("  No schedule was installed."));
    return;
  }

  console.error(`Unknown command: ${flags.command}`);
  process.exit(2);
}

if (import.meta.main) {
  await main(Bun.argv.slice(2));
}
