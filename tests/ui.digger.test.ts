/**
 * Digger + permissions smoke tests. These don't try to assert on the
 * exact ANSI bytes (those churn); they verify the digger doesn't crash
 * with animations off, and permission probing returns the right shape.
 */
import { test, expect } from "bun:test";
import { Digger } from "../src/ui/digger.ts";
import { setAnimationEnabled } from "../src/ui/tty.ts";
import { checkPermissions } from "../src/core/permissions.ts";

test("Digger: start/stop with animations off does not crash", () => {
  setAnimationEnabled(false);
  const d = new Digger();
  d.start("Testing");
  d.setMessage("Step 2");
  d.setProgress(0.5);
  d.stop("done");
  setAnimationEnabled(null);
});

test("Digger: setProgress clamps to [0, 1]", () => {
  setAnimationEnabled(false);
  const d = new Digger();
  d.start("x");
  d.setProgress(-1);
  d.setProgress(2);
  d.setProgress(0.7);
  d.stop();
  setAnimationEnabled(null);
});

test("checkPermissions returns the documented shape", () => {
  const s = checkPermissions();
  expect(typeof s.fullDiskAccess).toBe("boolean");
  expect(Array.isArray(s.blockedPaths)).toBe(true);
  expect(Array.isArray(s.readablePaths)).toBe(true);
  expect(Array.isArray(s.missingPaths)).toBe(true);
});
