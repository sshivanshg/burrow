/**
 * Cloud-storage awareness. The big risk is "cleaning" an iCloud Drive
 * file that's been evicted to save space — locally it looks like a real
 * file with size N, but its actual content lives in the cloud. Deleting
 * it would force a re-download (when online) or appear to delete user
 * data (when offline).
 *
 * Detection: two signals, either one is enough.
 *
 *   1. stat.blocks * 512 << stat.size  (the file occupies far less disk
 *      space than its logical size — classic dataless / sparse marker)
 *   2. xattr has com.apple.metadata:com_apple_clouddocs or related keys
 *
 * Also flags anything under ~/Library/Mobile Documents (iCloud Drive
 * mount), Dropbox, Google Drive — even if the file is fully materialised
 * we want the user to think twice before nuking sync-mirrored data.
 */
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const CLOUD_ROOTS = [
  `${homedir()}/Library/Mobile Documents`,       // iCloud Drive
  `${homedir()}/Library/CloudStorage`,            // generic
  `${homedir()}/Dropbox`,
  `${homedir()}/Google Drive`,
  `${homedir()}/OneDrive`,
];

export type CloudStatus = "local" | "evicted" | "in-sync-folder";

export function inCloudFolder(path: string): boolean {
  const p = resolve(path);
  return CLOUD_ROOTS.some((r) => p === r || p.startsWith(r + "/"));
}

/**
 * Inspect a path and report cloud status.
 *
 *   "evicted"        — file exists but its content is not on disk
 *   "in-sync-folder" — file lives under a cloud-sync mount but is local
 *   "local"          — ordinary local file
 *
 * Errors are reported as "local" — we don't want to over-flag.
 */
export function cloudStatus(path: string): CloudStatus {
  try {
    const st = statSync(path);
    // Real files only — directories don't get evicted the same way.
    if (st.isFile() && st.size > 4096) {
      const physical = st.blocks * 512;
      if (physical * 4 < st.size) return "evicted";
    }
    if (inCloudFolder(path)) return "in-sync-folder";
    // Best-effort xattr check; expensive so only if not already classified.
    const out = Bun.spawnSync(["xattr", path], { stderr: "ignore" }).stdout.toString();
    if (
      out.includes("com.apple.metadata:com_apple_clouddocs") ||
      out.includes("com.apple.fileprovider.fpcloud-status")
    ) {
      return "evicted";
    }
  } catch {
    // ignore
  }
  return "local";
}

/** Cheap classifier — only the path heuristic, no stat. */
export function quickCloudHint(path: string): boolean {
  return inCloudFolder(path);
}
