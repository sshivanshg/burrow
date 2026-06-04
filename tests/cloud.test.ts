import { test, expect } from "bun:test";
import { cloudStatus, inCloudFolder, quickCloudHint } from "../src/core/cloud.ts";
import { join } from "node:path";
import { homedir } from "node:os";

test("inCloudFolder recognises iCloud Drive mount", () => {
  const p = join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "thing.pdf");
  expect(inCloudFolder(p)).toBe(true);
});

test("inCloudFolder ignores ordinary paths", () => {
  expect(inCloudFolder("/etc/hosts")).toBe(false);
  expect(inCloudFolder(join(homedir(), "Downloads", "x.dmg"))).toBe(false);
});

test("cloudStatus returns 'local' for /etc/hosts", () => {
  expect(cloudStatus("/etc/hosts")).toBe("local");
});

test("quickCloudHint is cheap and consistent with inCloudFolder", () => {
  const p = join(homedir(), "Dropbox", "x");
  expect(quickCloudHint(p)).toBe(true);
});
