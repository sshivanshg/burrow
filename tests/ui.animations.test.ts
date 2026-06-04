import { test, expect } from "bun:test";
import { frameAt, progressBar, FRAMES } from "../src/ui/animations.ts";
import { mulberry32 } from "../src/ui/rng.ts";
import { setAnimationEnabled } from "../src/ui/tty.ts";

// Snapshot tests use a fixed seed so particle layouts are deterministic.

test("frameAt is deterministic for the same seed", () => {
  const opts = { width: 20, height: 4, count: 12, rng: mulberry32(42) };
  const a = frameAt(opts, 0);
  const b = frameAt({ ...opts, rng: mulberry32(42) }, 0);
  expect(a).toBe(b);
});

test("frameAt snapshot — seed 42, 20x4, 12 particles", () => {
  const frame = frameAt({ width: 20, height: 4, count: 12, rng: mulberry32(42) }, 0);
  // We don't pin the exact glyphs (the sparkle alphabet may evolve), but
  // the shape and ratio must hold.
  const lines = frame.split("\n");
  expect(lines).toHaveLength(4);
  for (const line of lines) expect(line.length).toBe(20);
  const nonSpace = frame.replace(/[\n ]/g, "").length;
  expect(nonSpace).toBeGreaterThan(0);
  expect(nonSpace).toBeLessThanOrEqual(12);
});

test("progressBar strips to a sensible width", () => {
  // disable animations so the bar uses no ANSI color (predictable length)
  setAnimationEnabled(false);
  process.env.NO_COLOR = "1";
  const bar = progressBar(0, 100, 20);
  expect(bar.length).toBe(20);
  const full = progressBar(100, 100, 20);
  // Full bar: 20 "█" with no partial block.
  expect([...full].filter((c) => c === "█").length).toBe(20);
  delete process.env.NO_COLOR;
  setAnimationEnabled(null);
});

test("FRAMES exposes mole + braille + sparkles", () => {
  expect(FRAMES.mole.length).toBeGreaterThan(3);
  expect(FRAMES.braille.length).toBeGreaterThan(6);
  expect(FRAMES.sparkles.length).toBeGreaterThan(3);
});
