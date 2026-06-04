#!/usr/bin/env bun
/**
 * Visual smoke test. Not run by `bun test` — run by hand:
 *   bun run tests/ui.demo.ts
 *
 * Useful in CI as a "does it crash" check too:
 *   FORCE_COLOR=1 bun run tests/ui.demo.ts
 */
import {
  Spinner,
  moleSpinner,
  progressBar,
  animateBytes,
  particleBurst,
  reveal,
  sleep,
} from "../src/ui/animations.ts";
import { brand, freed, dim } from "../src/ui/theme.ts";

console.clear();
await reveal("🐹 burrowed — animation demo");
console.log();

const m = moleSpinner();
m.start("Digging for junk…");
await sleep(1200);
m.setMessage("Measuring 24 items…");
await sleep(800);
m.stop("Found 24 junk folder(s).");

console.log();
console.log(dim("Progress bar:"));
for (let i = 0; i <= 100; i += 4) {
  process.stdout.write("\r  " + progressBar(i, 100, 40) + "  " + i + "%");
  await sleep(20);
}
process.stdout.write("\n\n");

console.log(dim("Animated bytes counter:"));
await animateBytes({
  to: 4_823_457_812,
  ms: 900,
  render: (_, formatted) => {
    process.stdout.write("\r  " + freed(formatted.padEnd(12)));
  },
});
process.stdout.write("\n\n");

console.log(dim("Particle burst:"));
await particleBurst({ width: 60, height: 5, count: 30, ms: 700 });
console.log();
console.log(brand("✨ Demo complete."));
