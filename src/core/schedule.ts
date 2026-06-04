/**
 * Schedule burrow cleanups via macOS launchd. We write a LaunchAgent
 * plist to ~/Library/LaunchAgents and `launchctl load -w` it.
 *
 * Cadences:
 *   daily   — every day at 03:00
 *   weekly  — Sundays at 03:00
 *   monthly — first of the month at 03:00
 *
 * The agent runs the current burrow binary (or `bun run index.ts` from
 * the source dir if no binary is on PATH). Output goes to
 * ~/Library/Logs/burrow-schedule.log so the user can verify it ran.
 */
import { existsSync, writeFileSync, rmSync, readlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { launchAgentPlist } from "./paths.ts";

export type Cadence = "daily" | "weekly" | "monthly";

interface CalendarSpec {
  Hour: number;
  Minute: number;
  Weekday?: number; // 0 = Sunday
  Day?: number;     // 1..31
}

function calendarFor(c: Cadence): CalendarSpec {
  if (c === "daily") return { Hour: 3, Minute: 0 };
  if (c === "weekly") return { Hour: 3, Minute: 0, Weekday: 0 };
  return { Hour: 3, Minute: 0, Day: 1 };
}

/** Find the burrow binary to schedule against, falling back to source. */
function findBurrowBin(): { argv: string[]; cwd?: string } {
  // 1) installed binary on PATH (e.g. via Homebrew)
  const which = Bun.spawnSync(["which", "burrow"]).stdout.toString().trim();
  if (which) return { argv: [which] };
  // 2) compiled binary in the repo
  const here = resolve(import.meta.dirname, "..", "..");
  const local = join(here, "burrow");
  if (existsSync(local)) return { argv: [local] };
  // 3) bun + index.ts (source mode)
  const bun = Bun.spawnSync(["which", "bun"]).stdout.toString().trim() || "/opt/homebrew/bin/bun";
  return { argv: [bun, "run", join(here, "index.ts")], cwd: here };
}

function plistEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPlist(cadence: Cadence, categories: string[]): string {
  const bin = findBurrowBin();
  const args = ["clean", ...categories, "-y", "--quarantine", "--no-animation"];
  const cal = calendarFor(cadence);
  const argv = [...bin.argv, ...args].map(plistEscape);
  const calKeys = Object.entries(cal)
    .map(([k, v]) => `      <key>${k}</key><integer>${v}</integer>`)
    .join("\n");
  const logDir = join(homedir(), "Library", "Logs");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>com.sshivanshg.burrow</string>
    <key>ProgramArguments</key>
    <array>
${argv.map((a) => `      <string>${a}</string>`).join("\n")}
    </array>
    <key>StartCalendarInterval</key>
    <dict>
${calKeys}
    </dict>
    <key>StandardOutPath</key><string>${plistEscape(join(logDir, "burrow-schedule.log"))}</string>
    <key>StandardErrorPath</key><string>${plistEscape(join(logDir, "burrow-schedule.log"))}</string>
    <key>RunAtLoad</key><false/>
  </dict>
</plist>
`;
}

export function install(cadence: Cadence, categories: string[] = ["dev-junk", "system-caches", "homebrew", "logs"]): { plistPath: string; loaded: boolean } {
  const plistPath = launchAgentPlist();
  const xml = renderPlist(cadence, categories);
  writeFileSync(plistPath, xml);
  // Unload first in case it's already loaded with old contents.
  Bun.spawnSync(["launchctl", "unload", plistPath], { stderr: "ignore", stdout: "ignore" });
  const load = Bun.spawnSync(["launchctl", "load", "-w", plistPath]);
  return { plistPath, loaded: load.exitCode === 0 };
}

export function uninstall(): { removed: boolean } {
  const plistPath = launchAgentPlist();
  if (!existsSync(plistPath)) return { removed: false };
  Bun.spawnSync(["launchctl", "unload", "-w", plistPath], { stderr: "ignore", stdout: "ignore" });
  rmSync(plistPath, { force: true });
  return { removed: true };
}

export function status(): { installed: boolean; plistPath: string } {
  const plistPath = launchAgentPlist();
  return { installed: existsSync(plistPath), plistPath };
}
