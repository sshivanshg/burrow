import { test, expect } from "bun:test";
import { buildScans, recommend } from "../src/core/recommendations.ts";
import type { Finding } from "../src/core/types.ts";

function find(category: string, n: number, sizeEach: number, safe: boolean): Finding[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `/tmp/${category}-${i}`,
    size: sizeEach,
    category,
    label: `${category}-${i}`,
    safe,
  }));
}

const noHistory = {
  totalCleans: 0,
  totalRemoved: 0,
  totalFreed: 0,
  perCategory: {},
  perDayLast30: {},
};

test("recommend picks the biggest pile as biggest win", () => {
  const scans = buildScans([
    { id: "small", title: "Small", findings: find("small", 1, 100 * 1024 * 1024, true) },
    { id: "big", title: "Big", findings: find("big", 1, 4 * 1024 * 1024 * 1024, false) },
  ]);
  const recs = recommend(scans, noHistory);
  expect(recs[0].kind).toBe("biggest");
  expect(recs[0].id).toBe("big");
});

test("easiest pick favours high pre-safe ratio", () => {
  const scans = buildScans([
    { id: "mixed", title: "Mixed", findings: [
      ...find("mixed", 1, 2 * 1024 * 1024 * 1024, false),
      ...find("mixed", 1, 200 * 1024 * 1024, true),
    ] },
    { id: "safe", title: "Safe", findings: find("safe", 1, 1.5 * 1024 * 1024 * 1024, true) },
  ]);
  const recs = recommend(scans, noHistory);
  const easiest = recs.find((r) => r.kind === "easiest");
  expect(easiest?.id).toBe("safe");
});

test("recommendations swallow noise under 50 MB", () => {
  const scans = buildScans([
    { id: "tiny", title: "tiny", findings: find("tiny", 1, 10 * 1024 * 1024, true) },
  ]);
  const recs = recommend(scans, noHistory);
  expect(recs).toHaveLength(0);
});

test("habit bias nudges toward repeat categories", () => {
  const scans = buildScans([
    { id: "habit", title: "h", findings: find("habit", 1, 1 * 1024 * 1024 * 1024, false) },
    { id: "fresh", title: "f", findings: find("fresh", 1, 1.2 * 1024 * 1024 * 1024, false) },
  ]);
  const recs = recommend(scans, {
    ...noHistory,
    totalCleans: 4,
    perCategory: { habit: { cleans: 4, freed: 1000, removed: 4 } },
  });
  // 1 GB × 1.5 bias = 1.5 GB > 1.2 GB unbiased fresh → habit wins.
  expect(recs[0].id).toBe("habit");
});
