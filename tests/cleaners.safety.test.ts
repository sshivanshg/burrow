/**
 * Universal safety contract — every registered cleaner must refuse to
 * delete root, the home dir, /etc, and other obvious foot-guns. If a
 * new cleaner skips this it fails CI.
 */
import { test, expect } from "bun:test";
import { homedir } from "node:os";
import { cleaners } from "../src/cleaners/index.ts";

const FORBIDDEN = ["/", homedir(), "/etc", "/etc/passwd", "/System", "/usr/bin/env"];

for (const c of cleaners) {
  test(`${c.meta.id}: refuses globally forbidden paths`, () => {
    for (const p of FORBIDDEN) {
      const result = c.isSafeToDelete(p, { root: "/tmp" });
      expect(result).toBe(false);
    }
  });
}

test("cleaner registry exposes IDs and looks them up", async () => {
  const { byId, listIds } = await import("../src/cleaners/index.ts");
  for (const id of listIds()) {
    expect(byId(id)).toBeDefined();
  }
  expect(byId("nope")).toBeUndefined();
});

test("cleaner meta shape is consistent", () => {
  for (const c of cleaners) {
    expect(c.meta.id).toBeTruthy();
    expect(c.meta.title).toBeTruthy();
    expect(c.meta.description).toBeTruthy();
    expect(typeof c.scan).toBe("function");
    expect(typeof c.isSafeToDelete).toBe("function");
    expect(typeof c.clean).toBe("function");
  }
});
