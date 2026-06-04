/**
 * macOS Full Disk Access (FDA) detection.
 *
 * Several cleaners want to read paths the TCC sandbox guards by default:
 *   ~/Library/Mail
 *   ~/Library/Messages
 *   ~/Library/Safari
 *   ~/Library/Application Support/com.apple.TCC
 *
 * If the host terminal hasn't been granted FDA, readdirSync on those
 * paths throws EPERM. We probe a couple of canaries and report.
 *
 * On non-darwin platforms or paths that simply don't exist, we treat
 * the missing capability as "not applicable" rather than "denied".
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface PermissionStatus {
  /** True when FDA is granted (or not needed because we're not on macOS). */
  fullDiskAccess: boolean;
  /** Subset of canary paths that exist but threw EPERM. */
  blockedPaths: string[];
  /** Subset of canary paths that we could read. */
  readablePaths: string[];
  /** Subset that just don't exist on this machine. */
  missingPaths: string[];
}

const CANARIES = [
  join(homedir(), "Library", "Mail"),
  join(homedir(), "Library", "Messages"),
  join(homedir(), "Library", "Safari"),
];

export function checkPermissions(): PermissionStatus {
  if (process.platform !== "darwin") {
    return {
      fullDiskAccess: true,
      blockedPaths: [],
      readablePaths: [],
      missingPaths: [],
    };
  }
  const blocked: string[] = [];
  const readable: string[] = [];
  const missing: string[] = [];
  for (const p of CANARIES) {
    if (!existsSync(p)) {
      missing.push(p);
      continue;
    }
    try {
      readdirSync(p);
      readable.push(p);
    } catch (e: any) {
      // EPERM is the TCC denial; ENOENT means it vanished between checks.
      if (e?.code === "EPERM" || e?.code === "EACCES") blocked.push(p);
      else missing.push(p);
    }
  }
  // We say FDA is granted when no canary that exists came back blocked.
  // If everything is missing (rare), we optimistically say yes — the
  // cleaners will surface "0 items" rather than crash.
  return {
    fullDiskAccess: blocked.length === 0,
    blockedPaths: blocked,
    readablePaths: readable,
    missingPaths: missing,
  };
}
