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

if (formula === before) {
  console.error("Formula was not modified — patterns probably stopped matching.");
  process.exit(1);
}

writeFileSync(formulaFile, formula);
console.log(`✓ Updated ${formulaFile}`);
console.log(`  version:  ${version}`);
console.log(`  arm64:    ${arm}`);
console.log(`  x64:      ${x64}`);
