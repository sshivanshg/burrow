#!/usr/bin/env bun
/**
 * One-command release.
 *
 *   bun run release patch   # 0.2.0 → 0.2.1
 *   bun run release minor   # 0.2.0 → 0.3.0
 *   bun run release major   # 0.2.0 → 1.0.0
 *
 * What it does:
 *   1. Verifies working tree is clean and we're on `main`.
 *   2. Pulls --rebase so we're up to date with origin/main.
 *   3. Bumps version in package.json + Formula/burrow.rb.
 *   4. Commits 'Release vX.Y.Z'.
 *   5. Tags vX.Y.Z (annotated).
 *   6. Pushes main + tag.
 *
 * CI does everything after that — builds binaries, attaches them to
 * the GitHub release, regenerates the Formula sha256s, and commits the
 * Formula update back to main. End users get the new version without
 * anyone manually touching anything.
 */
import { readFileSync, writeFileSync } from "node:fs";

type Kind = "patch" | "minor" | "major";

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function bump(v: string, kind: Kind): string {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) die(`unparseable version: ${v}`);
  const [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function run(argv: string[], opts: { inherit?: boolean } = {}) {
  const p = Bun.spawnSync(argv, {
    stdout: opts.inherit ? "inherit" : "pipe",
    stderr: opts.inherit ? "inherit" : "pipe",
  });
  if (p.exitCode !== 0) {
    die(`command failed: ${argv.join(" ")}\n${p.stderr?.toString() ?? ""}`);
  }
  return p.stdout?.toString().trim() ?? "";
}

function maybeArg(name: string): string | null {
  const v = process.argv.find((a) => a === name);
  return v ?? null;
}

const kind = process.argv[2] as Kind | undefined;
const dryRun = !!maybeArg("--dry-run");
if (!kind || !["patch", "minor", "major"].includes(kind)) {
  console.error("Usage: bun run release <patch|minor|major> [--dry-run]");
  process.exit(2);
}

// 1. Clean tree
const status = run(["git", "status", "--porcelain"]);
if (status) die("working tree is not clean. Commit or stash first.");

// 2. On main
const branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") die(`not on main (on ${branch}).`);

// 3. Up to date
if (!dryRun) run(["git", "pull", "--rebase", "origin", "main"], { inherit: true });

// 4. Bump
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const current = pkg.version as string;
const next = bump(current, kind);

console.log(`▸ bumping ${current} → ${next}`);
pkg.version = next;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

let formula = readFileSync("Formula/burrow.rb", "utf8");
const beforeFormula = formula;
formula = formula.replace(/version "[^"]+"/, `version "${next}"`);
if (formula === beforeFormula) die("could not patch version in Formula/burrow.rb");
writeFileSync("Formula/burrow.rb", formula);

let cli = readFileSync("src/cli.ts", "utf8");
const beforeCli = cli;
cli = cli.replace(/BURROW_VERSION = "[^"]+"/, `BURROW_VERSION = "${next}"`);
if (cli === beforeCli) die("could not patch BURROW_VERSION in src/cli.ts");
writeFileSync("src/cli.ts", cli);

if (dryRun) {
  console.log("─ dry run — not committing, tagging, or pushing ─");
  console.log("revert with: git checkout package.json Formula/burrow.rb");
  process.exit(0);
}

// 5. Commit
run(["git", "add", "package.json", "Formula/burrow.rb"]);
run(["git", "commit", "-m", `Release v${next}`], { inherit: true });

// 6. Tag
const tagMsg = `v${next}\n\nSee CHANGELOG / commit history for changes.`;
run(["git", "tag", "-a", `v${next}`, "-m", tagMsg]);

// 7. Push (main + tag — release CI fires on the tag)
console.log("▸ pushing main + tag");
run(["git", "push", "origin", "main"], { inherit: true });
run(["git", "push", "origin", `v${next}`], { inherit: true });

console.log();
console.log(`✓ released v${next}`);
console.log(`  CI will:`);
console.log(`    • build darwin-arm64 + darwin-x64 binaries`);
console.log(`    • attach them to https://github.com/sshivanshg/burrow/releases/tag/v${next}`);
console.log(`    • auto-update Formula/burrow.rb sha256s`);
console.log(`    • commit the Formula update back to main`);
console.log();
console.log(`  Users on brew run: brew update && brew upgrade sshivanshg/burrow/burrow`);
console.log(`  Users on curl re-run the install.sh — done.`);
