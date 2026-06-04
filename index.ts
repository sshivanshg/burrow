#!/usr/bin/env bun
/**
 * Entry point. Real code lives in src/. This file:
 *   - dispatches to the CLI when executed directly
 *   - re-exports the legacy API surface so existing tests pass
 */
import { walkDirs } from "./src/core/scan.ts";
import { JUNK } from "./src/cleaners/dev-junk.ts";
import { passesCommonGuards } from "./src/core/safety.ts";
import { basename } from "node:path";

export { human, sizesOf } from "./src/core/size.ts";

/** Legacy shim: findJunk(root, maxDepth) → string[]. */
export function findJunk(root: string, maxDepth: number): string[] {
  return walkDirs({
    root,
    maxDepth,
    match: (name) => name in JUNK,
    skipDescend: (name) => name === "node_modules",
  });
}

/** Legacy shim: isSafeToDelete(path, root) → boolean. */
export function isSafeToDelete(path: string, root: string): boolean {
  if (!passesCommonGuards(path, root)) return false;
  if (!(basename(path) in JUNK)) return false;
  return true;
}

if (import.meta.main) {
  const { main } = await import("./src/cli.ts");
  await main(Bun.argv.slice(2));
}
