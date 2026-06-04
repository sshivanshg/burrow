#!/usr/bin/env bun
/**
 * 🐹 burrow — dig out dev junk and reclaim disk space.
 * A tiny, Mole-inspired cleaner. Scans for build artifacts / caches / deps,
 * shows their sizes, and only deletes what you tick (dry-run by default-safe).
 */
import {
  intro, outro, multiselect, confirm, spinner, note, log, isCancel, cancel,
} from "@clack/prompts";
import pc from "picocolors";
import { readdirSync, rmSync } from "node:fs";
import { join, resolve, relative, basename } from "node:path";
import { homedir } from "node:os";

// ── What counts as "junk". `safe: true` = pre-checked (low-risk to delete). ──
type Junk = { desc: string; safe: boolean };
const JUNK: Record<string, Junk> = {
  node_modules: { desc: "Node deps", safe: true },
  ".next": { desc: "Next.js build", safe: true },
  ".nuxt": { desc: "Nuxt build", safe: true },
  ".svelte-kit": { desc: "SvelteKit build", safe: true },
  ".turbo": { desc: "Turborepo cache", safe: true },
  ".parcel-cache": { desc: "Parcel cache", safe: true },
  ".cache": { desc: "Cache", safe: true },
  ".vite": { desc: "Vite cache", safe: true },
  coverage: { desc: "Coverage report", safe: true },
  __pycache__: { desc: "Python bytecode", safe: true },
  ".pytest_cache": { desc: "Pytest cache", safe: true },
  ".mypy_cache": { desc: "Mypy cache", safe: true },
  ".ruff_cache": { desc: "Ruff cache", safe: true },
  ".gradle": { desc: "Gradle cache", safe: true },
  DerivedData: { desc: "Xcode build", safe: true },
  // Ambiguous — left UNCHECKED by default; you opt in:
  dist: { desc: "Build output", safe: false },
  build: { desc: "Build output", safe: false },
  out: { desc: "Build output", safe: false },
  target: { desc: "Rust/Java build", safe: false },
  venv: { desc: "Python venv", safe: false },
  ".venv": { desc: "Python venv", safe: false },
};

// Never descend into these while walking (saves time / avoids system caches).
const SKIP_DESCEND = new Set([".git", ".Trash", "Library", ".npm", "node_modules"]);

// ── tiny helpers ──────────────────────────────────────────────────────────
export function human(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i > 0 && n < 10 ? 1 : 0)} ${u[i]}`;
}

function parseArgs(argv: string[]) {
  const opts = { root: process.cwd(), dryRun: false, depth: 6, minMB: 0, list: false, help: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a === "--list" || a === "-l") opts.list = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--depth") opts.depth = Number(argv[++i]);
    else if (a === "--min") opts.minMB = Number(argv[++i]);
    else if (a.startsWith("-")) { /* ignore unknown */ }
    else positional.push(a);
  }
  if (positional[0]) opts.root = resolve(positional[0].replace(/^~/, homedir()));
  return opts;
}

function printHelp() {
  console.log(`
${pc.bold("🐹 burrow")} ${pc.dim("— dig out dev junk and reclaim disk space")}

${pc.bold("USAGE")}
  burrow [path] [options]

${pc.bold("OPTIONS")}
  -l, --list        Just print what was found and exit (no prompts)
  -n, --dry-run     Walk the picker but never delete
      --depth <n>   Max folder depth to scan (default 6)
      --min <MB>    Hide items smaller than this many MB
  -h, --help        Show this help

${pc.bold("EXAMPLES")}
  burrow                 ${pc.dim("# scan the current folder")}
  burrow ~/Projects      ${pc.dim("# scan all your projects")}
  burrow . --min 50      ${pc.dim("# only show junk ≥ 50 MB")}
  burrow ~/Projects -n   ${pc.dim("# preview, delete nothing")}

${pc.dim("Safe by design: pre-checks only low-risk items, skips Library/.git,")}
${pc.dim("never follows symlinks, and always asks before deleting.")}
`);
}

// ── walk the tree, collecting top-level junk dirs (don't recurse into them) ──
export function findJunk(root: string, maxDepth: number): string[] {
  const found: string[] = [];
  function walk(dir: string, depth: number) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; } // permission denied etc.
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      const full = join(dir, e.name);
      if (e.name in JUNK) { found.push(full); continue; } // matched → don't descend
      if (SKIP_DESCEND.has(e.name)) continue;
      if (depth < maxDepth) walk(full, depth + 1);
    }
  }
  walk(root, 0);
  return found;
}

// ── size each path with `du -sk` (batched; fast C implementation) ──
export function sizesOf(paths: string[]): Map<string, number> {
  const sizes = new Map<string, number>();
  const BATCH = 150;
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const out = Bun.spawnSync(["du", "-sk", ...batch]).stdout.toString();
    for (const line of out.split("\n")) {
      const m = line.match(/^(\d+)\t(.+)$/);
      if (m) sizes.set(m[2], Number(m[1]) * 1024);
    }
  }
  return sizes;
}

// ── deletion guardrails: only remove real junk under the scan root ──
export function isSafeToDelete(path: string, root: string): boolean {
  const p = resolve(path);
  if (p === "/" || p === homedir() || p === resolve(root)) return false;
  if (!p.startsWith(resolve(root))) return false;       // stay inside scan root
  if (!(basename(p) in JUNK)) return false;             // basename must be known junk
  return true;
}

// ── main (only runs when executed directly, not when imported by tests) ──
if (import.meta.main) {
const opts = parseArgs(Bun.argv.slice(2));
if (opts.help) { printHelp(); process.exit(0); }

console.clear();
intro(pc.bgMagenta(pc.black(" 🐹 burrow ")));

const root = opts.root;
log.info(`Scanning ${pc.cyan(root)} ${pc.dim(`(depth ${opts.depth})`)}`);

const s = spinner();
s.start("Digging for junk…");
const paths = findJunk(root, opts.depth);
if (paths.length === 0) {
  s.stop("Nothing to dig up.");
  outro(pc.green("✨ You're tidy — no dev junk found."));
  process.exit(0);
}
s.message(`Measuring ${paths.length} item(s)…`);
const sizes = sizesOf(paths);
s.stop(`Found ${pc.bold(String(paths.length))} junk folder(s).`);

// Build options, biggest first, filtered by --min
const items = paths
  .map((p) => ({ path: p, size: sizes.get(p) ?? 0 }))
  .filter((it) => it.size >= opts.minMB * 1024 * 1024)
  .sort((a, b) => b.size - a.size);

if (items.length === 0) {
  outro(pc.yellow(`Nothing ≥ ${opts.minMB} MB. Try a lower --min.`));
  process.exit(0);
}

const total = items.reduce((sum, it) => sum + it.size, 0);
const longest = Math.max(...items.map((it) => human(it.size).length));

note(
  `${pc.bold(human(total))} reclaimable across ${items.length} folder(s)`,
  "💾 Potential savings",
);

if (opts.list) {
  for (const it of items) {
    console.log(
      `${pc.yellow(human(it.size).padStart(longest))}  ` +
        `${pc.bold(basename(it.path))} ${pc.dim(relative(root, it.path) || ".")}`,
    );
  }
  outro(pc.cyan(`${human(total)} reclaimable across ${items.length} folder(s).`));
  process.exit(0);
}

const picked = await multiselect({
  message: "Select what to delete (space toggles, enter confirms):",
  options: items.map((it) => {
    const name = basename(it.path);
    const where = relative(root, it.path) || ".";
    return {
      value: it.path,
      label: `${pc.yellow(human(it.size).padStart(longest))}  ${pc.bold(name)} ${pc.dim(where)}`,
      hint: JUNK[name]?.desc,
    };
  }),
  initialValues: items.filter((it) => JUNK[basename(it.path)]?.safe).map((it) => it.path),
  required: false,
});

if (isCancel(picked)) { cancel("Cancelled — nothing deleted."); process.exit(0); }

const selected = (picked as string[]).filter((p) => isSafeToDelete(p, root));
if (selected.length === 0) {
  outro(pc.dim("Nothing selected — exiting."));
  process.exit(0);
}

const freeing = selected.reduce((sum, p) => sum + (sizes.get(p) ?? 0), 0);

if (opts.dryRun) {
  note(
    selected.map((p) => `${pc.dim("would remove")} ${relative(root, p)}`).join("\n"),
    `🧪 Dry run — ${human(freeing)} would be freed`,
  );
  outro(pc.cyan("Dry run complete. Re-run without --dry-run to delete."));
  process.exit(0);
}

const go = await confirm({
  message: `Delete ${pc.bold(String(selected.length))} folder(s) and reclaim ${pc.green(human(freeing))}?`,
  initialValue: false,
});
if (isCancel(go) || !go) { cancel("Cancelled — nothing deleted."); process.exit(0); }

const del = spinner();
del.start("Filling in the burrow…");
let removed = 0, failed = 0, reclaimed = 0;
for (const p of selected) {
  try {
    rmSync(p, { recursive: true, force: true });
    removed++; reclaimed += sizes.get(p) ?? 0;
    del.message(`Removed ${removed}/${selected.length} — ${human(reclaimed)} freed`);
  } catch {
    failed++;
    log.error(`Couldn't remove ${relative(root, p)}`);
  }
}
del.stop(`Removed ${removed} folder(s).`);

outro(
  pc.green(`✨ Reclaimed ${pc.bold(human(reclaimed))}`) +
    (failed ? pc.red(`  (${failed} failed)`) : ""),
);
}
