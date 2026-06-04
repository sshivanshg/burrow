/**
 * Shared safety guardrails. Every cleaner composes these on top of its
 * own per-category checks.
 *
 *   refusing to delete the wrong thing > deleting the right thing fast.
 */
import { resolve } from "node:path";
import { homedir } from "node:os";
import { lstatSync } from "node:fs";

/** Top-of-tree paths we never let any cleaner touch. */
const FORBIDDEN_PREFIXES = [
  "/System",
  "/Library/Apple",
  "/private/var/db",
  "/usr/bin",
  "/usr/sbin",
  "/bin",
  "/sbin",
  "/etc",
];

/** Returns false if removing this path would be obviously catastrophic. */
export function isGloballySafe(path: string): boolean {
  if (!path) return false;
  const p = resolve(path);
  if (p === "/" || p === homedir()) return false;
  if (p === resolve(homedir(), "Library")) return false;
  if (p === resolve(homedir(), "Desktop")) return false;
  if (p === resolve(homedir(), "Documents")) return false;
  if (p === resolve(homedir(), "Downloads")) return false;
  if (p === resolve(homedir(), "Pictures")) return false;
  if (p === resolve(homedir(), "Movies")) return false;
  if (p === resolve(homedir(), "Music")) return false;
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + "/")) return false;
  }
  return true;
}

/** True if `path` is under `root` (after resolving). */
export function isUnder(path: string, root: string): boolean {
  const p = resolve(path);
  const r = resolve(root);
  return p === r || p.startsWith(r + "/");
}

/** True if the path is a symlink. Never follow symlinks when deleting. */
export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** True when `path` exists right now. */
export function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compose the standard guards every cleaner wants:
 *   - not globally dangerous
 *   - inside the cleaner's allowed root
 *   - not a symlink
 *
 * Cleaners add their own name/allowlist check on top.
 */
export function passesCommonGuards(path: string, scope: string): boolean {
  if (!isGloballySafe(path)) return false;
  if (!isUnder(path, scope)) return false;
  if (isSymlink(path)) return false;
  return true;
}
