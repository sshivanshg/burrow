import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { human, findJunk, sizesOf, isSafeToDelete } from "./index.ts";

const ROOT = join(tmpdir(), `burrow-test-${process.pid}`);
const big = "x".repeat(10_000); // ~10 KB so `du` reports a non-zero size

function make(...parts: string[]) {
  const dir = join(ROOT, ...parts);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "file.bin"), big);
  return dir;
}

beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  make("projectA", "node_modules", "somepkg");
  make("projectA", "dist");
  make("projectA", "src"); // NOT junk
  make("projectB", ".next", "cache");
  make("projectB", "venv", "lib");
  make("node_modules", "pkg", "node_modules"); // nested — must NOT be double-counted
});

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

test("human() formats sizes", () => {
  expect(human(0)).toBe("0 B");
  expect(human(512)).toBe("512 B");
  expect(human(1024)).toBe("1.0 KB");
  expect(human(1536)).toBe("1.5 KB");
  expect(human(10 * 1024)).toBe("10 KB");
  expect(human(1024 * 1024)).toBe("1.0 MB");
});

test("findJunk finds top-level junk and does not descend into it", () => {
  const found = findJunk(ROOT, 6).map((p) => p.replace(ROOT + "/", ""));
  expect(found.sort()).toEqual(
    [
      "node_modules",
      "projectA/dist",
      "projectA/node_modules",
      "projectB/.next",
      "projectB/venv",
    ].sort(),
  );
  // the nested node_modules/pkg/node_modules must NOT appear
  expect(found.some((f) => f.includes("pkg/node_modules"))).toBe(false);
  // a normal source dir is never flagged
  expect(found).not.toContain("projectA/src");
});

test("sizesOf returns positive sizes for each path", () => {
  const paths = findJunk(ROOT, 6);
  const sizes = sizesOf(paths);
  for (const p of paths) expect(sizes.get(p)!).toBeGreaterThan(0);
});

test("isSafeToDelete guardrails", () => {
  const nm = join(ROOT, "projectA", "node_modules");
  expect(isSafeToDelete(nm, ROOT)).toBe(true); // real junk inside root → ok
  expect(isSafeToDelete(ROOT, ROOT)).toBe(false); // the root itself
  expect(isSafeToDelete(homedir(), ROOT)).toBe(false); // home dir
  expect(isSafeToDelete("/", ROOT)).toBe(false); // filesystem root
  expect(isSafeToDelete("/etc/passwd", ROOT)).toBe(false); // outside the root
  expect(isSafeToDelete(join(ROOT, "projectA", "src"), ROOT)).toBe(false); // not junk
});
