/**
 * Where burrow stores its own state on disk. One place so every other
 * module can ask for the right path without duplicating join() chains.
 */
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const APP_NAME = "burrow";

/** Resolve home dir, preferring $HOME so tests can sandbox via env. */
function home(): string {
  return process.env.HOME || homedir();
}

/** ~/Library/Application Support/burrow — for history, stats, settings. */
export function appSupportDir(): string {
  const dir = join(home(), "Library", "Application Support", APP_NAME);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** ~/.burrow-quarantine — soft-deleted items live here until purged. */
export function quarantineRoot(): string {
  const dir = join(home(), ".burrow-quarantine");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function historyFile(): string {
  return join(appSupportDir(), "history.jsonl");
}

export function stateFile(): string {
  return join(appSupportDir(), "state.json");
}

export function launchAgentPlist(): string {
  return join(home(), "Library", "LaunchAgents", "com.sshivanshg.burrow.plist");
}
