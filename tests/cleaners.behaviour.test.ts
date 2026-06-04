/**
 * Behaviour tests: each cleaner does what it says in a sandbox.
 * Uses temp dirs so we never touch the user's real machine state.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import devJunk from "../src/cleaners/dev-junk.ts";
import systemCaches from "../src/cleaners/system-caches.ts";
import appLeftovers from "../src/cleaners/app-leftovers.ts";
import largeFiles from "../src/cleaners/large-files.ts";

const ROOT = join(tmpdir(), `burrow-behaviour-${process.pid}`);

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
  // dev-junk fixtures
  mkdirSync(join(ROOT, "proj", "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(ROOT, "proj", "node_modules", "pkg", "f.bin"), "x".repeat(5000));
  mkdirSync(join(ROOT, "proj", "src"), { recursive: true });
  // symlink masquerading as junk — must be refused
  try {
    symlinkSync("/etc", join(ROOT, "proj", ".cache"));
  } catch {}
  // large-files fixtures
  writeFileSync(join(ROOT, "big.bin"), Buffer.alloc(15 * 1024 * 1024));
  writeFileSync(join(ROOT, "tiny.bin"), "x");
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

test("dev-junk: dry-run reports without deleting", async () => {
  const findings = await devJunk.scan({ root: ROOT });
  const target = findings.find((f) => f.label === "node_modules");
  expect(target).toBeDefined();
  const result = await devJunk.clean([target!], { root: ROOT, dryRun: true });
  expect(result.removed).toBe(1);
  expect(result.freed).toBeGreaterThan(0);
  expect(existsSync(target!.path)).toBe(true); // still there
});

test("dev-junk: refuses to delete a symlinked .cache", async () => {
  const fake = join(ROOT, "proj", ".cache");
  // walker won't find symlinks; emulate user passing it in directly:
  const finding = { path: fake, size: 0, category: "dev-junk", label: ".cache" };
  const result = await devJunk.clean([finding as any], { root: ROOT, dryRun: false });
  expect(result.removed).toBe(0);
  expect(result.failed).toBe(1);
});

test("dev-junk: real delete actually removes the dir", async () => {
  const findings = await devJunk.scan({ root: ROOT });
  const nm = findings.find((f) => f.label === "node_modules");
  expect(nm).toBeDefined();
  const result = await devJunk.clean([nm!], { root: ROOT, dryRun: false });
  expect(result.removed).toBe(1);
  expect(existsSync(nm!.path)).toBe(false);
});

test("system-caches: DENYLIST entries are refused even if passed directly", () => {
  // Denylisted names like com.apple.cloudkit should refuse.
  // (We can't easily build a real ~/Library/Caches/com.apple.cloudkit in a
  // test root, so we just call isSafeToDelete with a synthetic path
  // under the real CACHE_ROOT.)
  const home = process.env.HOME!;
  const fake = `${home}/Library/Caches/com.apple.cloudkit`;
  expect(systemCaches.isSafeToDelete(fake, {})).toBe(false);
});

test("app-leftovers: returns [] when no appName provided", async () => {
  const f1 = await appLeftovers.scan({});
  expect(f1).toEqual([]);
  const f2 = await appLeftovers.scan({ appName: "" } as any);
  expect(f2).toEqual([]);
});

test("large-files: respects --min threshold", async () => {
  const findings = await largeFiles.scan({ root: ROOT, depth: 2, minMB: 10 });
  // Should find big.bin (15 MB), should NOT find tiny.bin (1 byte)
  expect(findings.some((f) => f.label === "big.bin")).toBe(true);
  expect(findings.some((f) => f.label === "tiny.bin")).toBe(false);
});

test("large-files: refuses to delete files outside scope", () => {
  expect(largeFiles.isSafeToDelete("/etc/passwd", { root: ROOT })).toBe(false);
  expect(largeFiles.isSafeToDelete(join(ROOT, "big.bin"), { root: ROOT })).toBe(true);
});
