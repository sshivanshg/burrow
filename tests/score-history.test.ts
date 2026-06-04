import { test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { summarise } from "../src/core/score-history.ts";

const SANDBOX = join(tmpdir(), `burrow-score-history-${process.pid}`);
let prevHome: string | undefined;

beforeEach(() => {
  rmSync(SANDBOX, { recursive: true, force: true });
  mkdirSync(SANDBOX, { recursive: true });
  prevHome = process.env.HOME;
  process.env.HOME = SANDBOX;
});

afterEach(() => {
  if (prevHome) process.env.HOME = prevHome;
  rmSync(SANDBOX, { recursive: true, force: true });
});

test("appendScore round-trips through readScoreHistory", async () => {
  const { appendScore, readScoreHistory } = await import("../src/core/score-history.ts?sh-1");
  appendScore({
    total: 22,
    grade: "F",
    components: {
      diskFree: { name: "Disk free", points: 4, value: 8.5, detail: "" },
      reclaimable: { name: "Reclaimable", points: 18, value: 0, detail: "" },
      dormantApps: { name: "Dormant apps", points: 0, value: 38, detail: "" },
      recency: { name: "Recency", points: 0, value: Infinity, detail: "" },
    },
    computedAt: Date.now(),
  } as any);
  appendScore({
    total: 58,
    grade: "D",
    components: {
      diskFree: { name: "Disk free", points: 12, value: 18, detail: "" },
      reclaimable: { name: "Reclaimable", points: 23, value: 0, detail: "" },
      dormantApps: { name: "Dormant apps", points: 15, value: 12, detail: "" },
      recency: { name: "Recency", points: 8, value: 30, detail: "" },
    },
    computedAt: Date.now(),
  } as any);
  const rows = readScoreHistory();
  expect(rows).toHaveLength(2);
  expect(rows[0].total).toBe(22);
  expect(rows[1].total).toBe(58);
  expect(rows[0].c.df).toBe(4);
});

test("summarise gives correct sparkline + delta + arrow", () => {
  const entries = [
    { ts: "x", total: 20, grade: "F" as const, c: { df: 5, rc: 5, da: 5, re: 5 } },
    { ts: "x", total: 40, grade: "D" as const, c: { df: 10, rc: 10, da: 10, re: 10 } },
    { ts: "x", total: 80, grade: "B" as const, c: { df: 20, rc: 20, da: 20, re: 20 } },
  ];
  const t = summarise(entries);
  expect(t.delta).toBe(60);
  expect(t.arrow).toBe("↗");
  expect(t.sparkline.length).toBe(3);
});

test("summarise marks flat trend with →", () => {
  const entries = [
    { ts: "x", total: 50, grade: "D" as const, c: { df: 0, rc: 0, da: 0, re: 0 } },
    { ts: "x", total: 50, grade: "D" as const, c: { df: 0, rc: 0, da: 0, re: 0 } },
  ];
  const t = summarise(entries);
  expect(t.arrow).toBe("→");
});

test("recentEntries respects windowDays", async () => {
  const { recentEntries, appendScore } = await import("../src/core/score-history.ts?sh-2");
  // 60d ago + now → with windowDays=30 only the recent one survives
  const old = new Date(Date.now() - 60 * 86400_000).getTime();
  appendScore({ total: 10, grade: "F", components: dummyComponents(), computedAt: old } as any);
  appendScore({ total: 90, grade: "A", components: dummyComponents(), computedAt: Date.now() } as any);
  const within = recentEntries({ windowDays: 30 });
  expect(within).toHaveLength(1);
  expect(within[0].total).toBe(90);
});

function dummyComponents() {
  return {
    diskFree: { name: "", points: 0, value: 0, detail: "" },
    reclaimable: { name: "", points: 0, value: 0, detail: "" },
    dormantApps: { name: "", points: 0, value: 0, detail: "" },
    recency: { name: "", points: 0, value: 0, detail: "" },
  };
}
