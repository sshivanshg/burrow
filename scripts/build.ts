#!/usr/bin/env bun
/**
 * Cross-compile burrowed into single-file binaries for darwin-arm64 and
 * darwin-x64. Output: dist/burrowed-darwin-arm64, dist/burrowed-darwin-x64.
 *
 * Used by .github/workflows/release.yml.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TARGETS = ["bun-darwin-arm64", "bun-darwin-x64"] as const;
const OUT_DIR = "dist";

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

let failed = 0;
for (const t of TARGETS) {
  const suffix = t.replace(/^bun-/, "");
  const outfile = join(OUT_DIR, `burrowed-${suffix}`);
  console.log(`▸ building ${outfile} …`);
  const p = Bun.spawnSync(
    [
      "bun",
      "build",
      "--compile",
      "--minify",
      "--target",
      t,
      "--outfile",
      outfile,
      "index.ts",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (p.exitCode !== 0) {
    console.error(`✗ ${outfile} failed`);
    failed++;
  } else {
    console.log(`✓ ${outfile}`);
  }
}

if (failed > 0) {
  console.error(`${failed} target(s) failed`);
  process.exit(1);
}

console.log("\nAll builds OK. Artifacts in dist/.");
