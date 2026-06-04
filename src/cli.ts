#!/usr/bin/env bun
/**
 * burrow CLI entry. Routes subcommands to handlers.
 *
 *   burrow                       interactive dashboard
 *   burrow scan [path]           scan dev-junk under `path` (default cwd)
 *   burrow clean <category>      pick + clean by category (--yes to skip prompts)
 *   burrow uninstall <app>       hunt leftovers for a removed app
 *   burrow dashboard             same as `burrow` with no args
 *   burrow doctor                sanity-check guardrails + tool availability
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
import { brand, dim, sky } from "./ui/theme.ts";
import { setAnimationEnabled, installCursorGuard } from "./ui/tty.ts";

interface Flags {
  command: string;
  positional: string[];
  dryRun: boolean;
  list: boolean;
  help: boolean;
  json: boolean;
  yes: boolean;
  quiet: boolean;
  noAnimation: boolean;
  depth: number;
  minMB: number;
  olderThan: number;
}

export function parseArgs(argv: string[]): Flags {
  const f: Flags = {
    command: "",
    positional: [],
    dryRun: false,
    list: false,
    help: false,
    json: false,
    yes: false,
    quiet: false,
    noAnimation: false,
    depth: 6,
    minMB: 0,
    olderThan: 90,
  };
  const KNOWN_COMMANDS = new Set(["scan", "clean", "uninstall", "dashboard", "doctor"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "-n") f.dryRun = true;
    else if (a === "--list" || a === "-l") f.list = true;
    else if (a === "--help" || a === "-h") f.help = true;
    else if (a === "--json") f.json = true;
    else if (a === "--yes" || a === "-y") f.yes = true;
    else if (a === "--quiet" || a === "-q") f.quiet = true;
    else if (a === "--no-animation") f.noAnimation = true;
    else if (a === "--depth") f.depth = Number(argv[++i]);
    else if (a === "--min") f.minMB = Number(argv[++i]);
    else if (a === "--older-than") f.olderThan = Number(argv[++i]);
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
  burrow                       Interactive dashboard
  burrow scan [path]           Scan dev-junk under [path] (default: cwd)
  burrow clean <category>      Clean by category (${listIds().join(", ")})
  burrow uninstall <app>       Hunt leftover files for an uninstalled app
  burrow dashboard             Same as \`burrow\` with no args
  burrow doctor                Sanity-check guardrails

${pc.bold("OPTIONS")}
  -l, --list           Print findings and exit (no prompts)
  -n, --dry-run        Walk the picker but never delete
  -y, --yes            Skip confirmations (only with \`clean <category>\`)
      --json           Machine-readable output (disables animations)
      --no-animation   Plain output, no spinners or particles
  -q, --quiet          Minimal output
      --depth <n>      Max folder depth (default 6)
      --min <MB>       Hide items smaller than this many MB
      --older-than <d> Age threshold in days (downloads/logs)
  -h, --help           Show this help

${pc.bold("EXAMPLES")}
  burrow                          ${pc.dim("# dashboard")}
  burrow scan ~/Projects          ${pc.dim("# scan dev-junk under ~/Projects")}
  burrow scan ~/Projects -l       ${pc.dim("# just print findings")}
  burrow clean system-caches -n   ${pc.dim("# dry-run system caches")}
  burrow uninstall Slack          ${pc.dim("# find leftover Slack files")}
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

  // No subcommand → dashboard
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
    // dev-junk + large-files + duplicates take a root; default to cwd.
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

  console.error(`Unknown command: ${flags.command}`);
  process.exit(2);
}

if (import.meta.main) {
  await main(Bun.argv.slice(2));
}
