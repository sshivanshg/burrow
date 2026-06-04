#!/usr/bin/env bun
/**
 * Update Formula/burrow.rb with new version + sha256s. Used by the
 * Release CI workflow after generating SHA256SUMS for a built release.
 *
 *   bun scripts/update-formula.ts <sha-file> <formula-file> <version>
 *
 *   bun scripts/update-formula.ts dist/SHA256SUMS Formula/burrow.rb 0.3.0
 */
import { readFileSync, writeFileSync } from "node:fs";

const [shaFile, formulaFile, version] = process.argv.slice(2);
if (!shaFile || !formulaFile || !version) {
  console.error("Usage: bun scripts/update-formula.ts <sha-file> <formula-file> <version>");
  process.exit(2);
}

const sha = readFileSync(shaFile, "utf8");
const arm = sha.match(/^([a-f0-9]{64})\s+burrow-darwin-arm64$/m)?.[1];
const x64 = sha.match(/^([a-f0-9]{64})\s+burrow-darwin-x64$/m)?.[1];
if (!arm || !x64) {
  console.error(`SHA file is missing one of the expected binaries.\n${sha}`);
  process.exit(1);
}

let formula = readFileSync(formulaFile, "utf8");
const before = formula;

formula = formula.replace(/version "[^"]+"/, `version "${version}"`);
formula = formula.replace(
  /(Hardware::CPU\.arm\?[\s\S]*?sha256 ")[a-f0-9]{64}(")/,
  `$1${arm}$2`,
);
formula = formula.replace(
  /(else[\s\S]*?sha256 ")[a-f0-9]{64}(")/,
  `$1${x64}$2`,
);

// Sanity check: the formula must contain the version + sha256 lines we
// were supposed to patch. Missing them = the formula structure changed
// out from under us, and we should scream loudly.
const hasVersion = /version "([^"]+)"/.test(formula);
const shaCount = (formula.match(/sha256 "[a-f0-9]{64}"/g) ?? []).length;
if (!hasVersion || shaCount < 2) {
  console.error("Formula is missing expected version or sha256 declarations.");
  console.error("(Expected: 1 version line + at least 2 sha256 lines.)");
  process.exit(1);
}

if (formula === before) {
  // Patterns matched, but values already correct. Idempotent — totally fine.
  // Happens when the binary is byte-identical to the previous release
  // (e.g., a no-op version bump).
  console.log(`✓ Formula already at version ${version} with matching SHAs — nothing to update.`);
  process.exit(0);
}

writeFileSync(formulaFile, formula);
console.log(`✓ Updated ${formulaFile}`);
console.log(`  version:  ${version}`);
console.log(`  arm64:    ${arm}`);
console.log(`  x64:      ${x64}`);
