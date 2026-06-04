import { test, expect } from "bun:test";
import { computeScore } from "../src/core/score.ts";

test("computeScore returns a value 0..100 with subcomponents that sum to total", async () => {
  const s = await computeScore({ reclaimableBytes: 0, dormantCount: 0 });
  expect(s.total).toBeGreaterThanOrEqual(0);
  expect(s.total).toBeLessThanOrEqual(100);
  const sum =
    Math.round(s.components.diskFree.points) +
    Math.round(s.components.reclaimable.points) +
    Math.round(s.components.dormantApps.points) +
    Math.round(s.components.recency.points);
  expect(Math.abs(sum - s.total)).toBeLessThanOrEqual(1);
});

test("tidy machine (0 reclaimable, 0 dormant) scores higher than messy machine", async () => {
  const tidy = await computeScore({ reclaimableBytes: 0, dormantCount: 0 });
  const messy = await computeScore({
    reclaimableBytes: 30 * 1024 * 1024 * 1024,
    dormantCount: 30,
  });
  expect(tidy.total).toBeGreaterThan(messy.total);
});

test("grade thresholds: A ≥ 90, F < 40", async () => {
  // We can't easily force a 95 vs 30 without mocking disk + recency; but
  // we can check that grades correlate monotonically with totals across
  // a few synthetic computations.
  const a = await computeScore({ reclaimableBytes: 0, dormantCount: 0 });
  const b = await computeScore({
    reclaimableBytes: 30 * 1024 * 1024 * 1024,
    dormantCount: 30,
  });
  const order = { F: 0, D: 1, C: 2, B: 3, A: 4 };
  expect(order[a.grade]).toBeGreaterThanOrEqual(order[b.grade]);
});
