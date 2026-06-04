#!/usr/bin/env bun
/**
 * burrow CLI entry. Routes subcommands to handlers; falls back to the
 * legacy dev-junk picker when invoked with just a path (the v0.0.x UX).
 *
 *   burrow                       interactive dashboard
 *   burrow scan [path]           scan dev-junk in `path` (default cwd)
 *   burrow clean <category>      clean by category (with --yes for non-interactive)
 *   burrow uninstall <app>       hunt leftovers for a removed app
 *   burrow dashboard             same as `burrow` with no args
 *   burrow doctor                sanity-check guardrails
 *   burrow --help
 */
import pc from "picocolors";
import { intro, outro, multiselect, confirm, note, log, isCancel, cancel } from "@clack/prompts";
import { basename, relative, resolve } from "node:path";
import { homedir } from "node:os";
import devJunk from "./cleaners/dev-junk.ts";
import { byId, listIds, cleaners } from "./cleaners/index.ts";
import { human } from "./core/size.ts";
import { moleSpinner, animateBytes, particleBurst, reveal } from "./ui/animations.ts";
import { brand, freed as freedColor, dim, sky } from "./ui/theme.ts";
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
  burrow clean dev-junk -y        ${pc.dim("# clean without prompts")}

${pc.dim("Safe by design: known-safe items pre-checked, ambiguous ones unchecked,")}
${pc.dim("never follows symlinks, never deletes outside the scan root.")}
`);
}

/** Interactive picker for dev-junk findings. Returns selected paths. */
async function pickDevJunk(findings: typeof devJunk extends never ? never : Awaited<ReturnType<typeof devJunk.scan>>, root: string) {
  const longest = Math.max(...findings.map((f) => human(f.size).length));
  const picked = await multiselect({
    message: "Select what to delete (space toggles, enter confirms):",
    options: findings.map((f) => ({
      value: f.path,
      label: `${pc.yellow(human(f.size).padStart(longest))}  ${pc.bold(f.label)} ${pc.dim(relative(root, f.path) || ".")}`,
      hint: f.description,
    })),
    initialValues: findings.filter((f) => f.safe).map((f) => f.path),
    required: false,
  });
  return picked;
}

async function runDevJunkInteractive(flags: Flags) {
  const positionalRoot = flags.positional[0];
  const root = positionalRoot
    ? resolve(positionalRoot.replace(/^~/, homedir()))
    : process.cwd();

  if (!flags.json) {
    console.clear();
    intro(pc.bgMagenta(pc.black(" 🐹 burrow ")));
    log.info(`Scanning ${sky(root)} ${dim(`(depth ${flags.depth})`)}`);
  }

  const sp = moleSpinner();
  sp.start("Digging for junk…");
  const findings = await devJunk.scan({ root, depth: flags.depth, minMB: flags.minMB });
  if (findings.length === 0) {
    sp.stop("Nothing to dig up.");
    if (flags.json) console.log(JSON.stringify({ findings: [], total: 0 }));
    else outro(pc.green("✨ You're tidy — no dev junk found."));
    return;
  }
  sp.stop(`Found ${pc.bold(String(findings.length))} junk folder(s).`);

  findings.sort((a, b) => b.size - a.size);
  const total = findings.reduce((s, f) => s + f.size, 0);

  if (flags.json) {
    console.log(JSON.stringify({ findings, total }, null, 2));
    return;
  }

  note(
    `${pc.bold(human(total))} reclaimable across ${findings.length} folder(s)`,
    "💾 Potential savings",
  );

  if (flags.list) {
    const longest = Math.max(...findings.map((f) => human(f.size).length));
    for (const f of findings) {
      console.log(
        `${pc.yellow(human(f.size).padStart(longest))}  ` +
          `${pc.bold(f.label)} ${pc.dim(relative(root, f.path) || ".")}`,
      );
    }
    outro(sky(`${human(total)} reclaimable across ${findings.length} folder(s).`));
    return;
  }

  const picked = await pickDevJunk(findings, root);
  if (isCancel(picked)) {
    cancel("Cancelled — nothing deleted.");
    return;
  }
  const selected = findings.filter((f) =>
    (picked as string[]).includes(f.path) && devJunk.isSafeToDelete(f.path, { root }),
  );
  if (selected.length === 0) {
    outro(pc.dim("Nothing selected — exiting."));
    return;
  }
  const freeing = selected.reduce((s, f) => s + f.size, 0);

  if (flags.dryRun) {
    note(
      selected.map((f) => `${pc.dim("would remove")} ${relative(root, f.path)}`).join("\n"),
      `🧪 Dry run — ${human(freeing)} would be freed`,
    );
    outro(sky("Dry run complete. Re-run without --dry-run to delete."));
    return;
  }

  const go = await confirm({
    message: `Delete ${pc.bold(String(selected.length))} folder(s) and reclaim ${pc.green(human(freeing))}?`,
    initialValue: false,
  });
  if (isCancel(go) || !go) {
    cancel("Cancelled — nothing deleted.");
    return;
  }

  const del = moleSpinner();
  del.start("Filling in the burrow…");
  const result = await devJunk.clean(selected, {
    root,
    dryRun: false,
    onProgress: (n, total, freed) => del.setMessage(`Removed ${n}/${total} — ${human(freed)} freed`),
  });
  del.stop(`Removed ${result.removed} folder(s).`);

  await animateBytes({
    to: result.freed,
    ms: 700,
    render: (_, str) => process.stdout.write("\r  " + freedColor(`Reclaimed ${str}`) + "        "),
  });
  process.stdout.write("\n");
  await particleBurst({ width: Math.min(60, process.stdout.columns ?? 60), height: 3, count: 24, ms: 500 });

  outro(
    brand(`✨ Reclaimed ${human(result.freed)}`) +
      (result.failed ? pc.red(`  (${result.failed} failed)`) : ""),
  );
}

export async function main(argv: string[]) {
  installCursorGuard();
  const flags = parseArgs(argv);
  if (flags.noAnimation || flags.json) setAnimationEnabled(false);

  if (flags.help) {
    printHelp();
    return;
  }

  // No subcommand: legacy behavior (dev-junk picker on positional[0] or cwd).
  // The dashboard takes over once it's built; for now we route to dev-junk.
  if (!flags.command || flags.command === "dashboard") {
    await runDevJunkInteractive(flags);
    return;
  }

  if (flags.command === "scan") {
    await runDevJunkInteractive({ ...flags, list: true });
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
    // For now only dev-junk supports interactive clean; other cleaners land in later iterations.
    await runDevJunkInteractive(flags);
    return;
  }

  if (flags.command === "doctor") {
    await reveal("🩺 burrow doctor");
    for (const c of cleaners) {
      const ok = (await Promise.resolve(c.meta.available?.() ?? true));
      console.log(`  ${ok ? pc.green("✓") : pc.yellow("○")} ${c.meta.id.padEnd(16)} ${pc.dim(c.meta.title)}`);
    }
    return;
  }

  if (flags.command === "uninstall") {
    console.error("burrow uninstall: not yet wired in this iteration.");
    process.exit(2);
  }

  console.error(`Unknown command: ${flags.command}`);
  process.exit(2);
}

if (import.meta.main) {
  await main(Bun.argv.slice(2));
}
