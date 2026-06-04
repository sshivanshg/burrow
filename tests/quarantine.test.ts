/**
 * Quarantine + history smoke tests in a sandboxed HOME.
 */
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const SANDBOX = join(tmpdir(), `burrow-quarantine-${process.pid}`);
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

test("quarantineBatch moves items into a manifest dir", async () => {
  const { quarantineBatch, listBatches, restoreBatch } = await import("../src/core/quarantine.ts?qa-1");
  const fixture = join(SANDBOX, "thing");
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "file"), "hello");

  const batch = quarantineBatch("dev-junk", [{ path: fixture, size: 5 }]);
  expect(batch.items).toHaveLength(1);
  expect(existsSync(fixture)).toBe(false); // moved out
  expect(existsSync(batch.items[0].stored)).toBe(true);

  const found = listBatches();
  expect(found.some((b) => b.id === batch.id)).toBe(true);

  // Restore puts it back
  const r = restoreBatch(batch);
  expect(r.every((x) => x.ok)).toBe(true);
  expect(existsSync(fixture)).toBe(true);
});

test("history rows append to the JSONL file", async () => {
  // Cache-bust the module import so it re-reads process.env.HOME via paths.ts.
  const { record, readHistory, aggregate } = await import("../src/core/history.ts?qa-2");
  record({
    ts: new Date().toISOString(),
    category: "dev-junk",
    removed: 3,
    failed: 0,
    freed: 12345,
    dryRun: false,
    quarantined: false,
  });
  record({
    ts: new Date().toISOString(),
    category: "system-caches",
    removed: 1,
    failed: 0,
    freed: 99999,
    dryRun: false,
    quarantined: true,
  });
  const rows = readHistory();
  expect(rows.length).toBeGreaterThanOrEqual(2);
  const stats = aggregate(rows);
  expect(stats.totalCleans).toBeGreaterThanOrEqual(2);
  expect(stats.totalFreed).toBeGreaterThanOrEqual(112344);
  expect(stats.perCategory["dev-junk"].cleans).toBeGreaterThanOrEqual(1);
});
