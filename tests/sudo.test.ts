import { test, expect } from "bun:test";
import { hasTouchIDForSudo, runWithAdmin } from "../src/core/sudo.ts";

test("hasTouchIDForSudo returns a boolean", () => {
  expect(typeof hasTouchIDForSudo()).toBe("boolean");
});

test("runWithAdmin on non-darwin is a structured failure, not a throw", async () => {
  if (process.platform === "darwin") return; // can't safely test the dialog
  const r = await runWithAdmin("echo hi", "test");
  expect(r.ok).toBe(false);
});
