/**
 * Privileged-exec wrapper. macOS' osascript `with administrator privileges`
 * surfaces the system auth dialog, which honors TouchID when the user has
 * "Use Touch ID for sudo" configured in System Settings → Touch ID &
 * Password.
 *
 *   const r = await runWithAdmin('purge', 'Free up inactive memory');
 *
 * Returns { ok, stdout, stderr }. Never throws — caller decides how to
 * react to a denied prompt.
 */

export interface AdminResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  cancelled: boolean;
}

export async function runWithAdmin(cmd: string, reason: string): Promise<AdminResult> {
  if (process.platform !== "darwin") {
    return { ok: false, stdout: "", stderr: "admin ops only on macOS", cancelled: false };
  }
  // Escape inner double quotes; AppleScript strings are double-quoted.
  const escapedCmd = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedReason = reason.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const apple = `do shell script "${escapedCmd}" with prompt "${escapedReason}" with administrator privileges`;
  const p = Bun.spawnSync(["osascript", "-e", apple]);
  const stderr = p.stderr.toString();
  const cancelled = stderr.includes("User canceled");
  return {
    ok: p.exitCode === 0,
    stdout: p.stdout.toString(),
    stderr,
    cancelled,
  };
}

/** True when the user appears to have configured TouchID for sudo. */
export function hasTouchIDForSudo(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    // /etc/pam.d/sudo (or sudo_local on Sonoma+) lists `pam_tid.so` when enabled.
    const candidates = ["/etc/pam.d/sudo_local", "/etc/pam.d/sudo"];
    for (const f of candidates) {
      const r = Bun.spawnSync(["grep", "-l", "pam_tid", f], { stderr: "ignore" });
      if (r.exitCode === 0) return true;
    }
  } catch {
    // ignore
  }
  return false;
}
