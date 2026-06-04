/**
 * Full Disk Access onboarding screen. Shown on dashboard launch if the
 * permission check came back denied. Walks the user through granting
 * FDA in System Settings and waits for them to confirm.
 *
 * UX:
 *   - boxed instructions panel
 *   - open System Settings on confirm (`open "x-apple.systempreferences:…"`)
 *   - re-probe after they say "I've done it"
 *   - if still denied, gracefully offer to continue WITHOUT the gated
 *     cleaners
 */
import pc from "picocolors";
import { select, isCancel } from "@clack/prompts";
import { checkPermissions, type PermissionStatus } from "../core/permissions.ts";
import { brand, dim, sky, danger, palette, rgb } from "./theme.ts";
import { reveal, sleep } from "./animations.ts";
import { animationsEnabled, termWidth } from "./tty.ts";

const SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

function boxLine(s: string, w: number, pad = 2): string {
  // Pad/trim to width, ignoring ANSI for length math.
  const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
  const need = Math.max(0, w - plain.length - pad * 2);
  return `${rgb(palette.fur, "│")}${" ".repeat(pad)}${s}${" ".repeat(need)}${" ".repeat(pad)}${rgb(palette.fur, "│")}`;
}

function boxTop(w: number): string {
  return rgb(palette.fur, "┌" + "─".repeat(w - 2) + "┐");
}

function boxBot(w: number): string {
  return rgb(palette.fur, "└" + "─".repeat(w - 2) + "┘");
}

function renderInstructions(status: PermissionStatus) {
  const w = Math.min(72, termWidth() - 4);
  console.log();
  console.log(boxTop(w));
  console.log(boxLine(brand("🔐  burrowed needs Full Disk Access"), w));
  console.log(boxLine("", w));
  console.log(
    boxLine(
      "Some cleaners (mail-attachments, app-leftovers in Containers,",
      w,
    ),
  );
  console.log(
    boxLine(
      "Safari history-cache, …) can't see their target paths without it.",
      w,
    ),
  );
  console.log(boxLine("", w));
  console.log(boxLine(dim("Blocked right now:"), w));
  for (const p of status.blockedPaths.slice(0, 3)) {
    console.log(boxLine(`  ${danger("✗")} ${p.replace(process.env.HOME ?? "", "~")}`, w));
  }
  console.log(boxLine("", w));
  console.log(boxLine(sky("To grant access:"), w));
  console.log(boxLine("  1. Open System Settings → Privacy & Security", w));
  console.log(boxLine("  2. Choose 'Full Disk Access'", w));
  console.log(boxLine("  3. Add your terminal app (Terminal / iTerm / Ghostty)", w));
  console.log(boxLine("  4. Restart your terminal and re-run burrowed", w));
  console.log(boxLine("", w));
  console.log(
    boxLine(dim("(burrowed is read-only until you confirm a deletion.)"), w),
  );
  console.log(boxBot(w));
  console.log();
}

/**
 * Returns the final permission status. Caller decides whether to skip
 * gated cleaners based on `fullDiskAccess`.
 */
export async function ensurePermissions(): Promise<PermissionStatus> {
  let status = checkPermissions();
  if (status.fullDiskAccess) return status;

  if (animationsEnabled()) await reveal("🪪 First-run permission check");
  renderInstructions(status);

  const choice = await select({
    message: "How would you like to proceed?",
    options: [
      { value: "open", label: `Open System Settings now ${dim("(recommended)")}` },
      { value: "skip", label: "Continue without — skip the gated cleaners" },
      { value: "quit", label: dim("Exit and grant it later") },
    ],
  });
  if (isCancel(choice) || choice === "quit") {
    console.log(dim("\n  See you when you're back. 🐹\n"));
    process.exit(0);
  }

  if (choice === "skip") {
    console.log(dim("  Continuing without FDA. Some categories will show fewer findings.\n"));
    return status;
  }

  // choice === "open": fire `open` and wait for the user to come back.
  Bun.spawnSync(["open", SETTINGS_URL]);
  console.log(dim("\n  System Settings is open. Add your terminal under 'Full Disk Access',"));
  console.log(dim("  then come back here.\n"));

  const ready = await select({
    message: "When you've added your terminal:",
    options: [
      { value: "recheck", label: "I've granted access — re-check" },
      { value: "skip", label: "Forget it — continue without FDA" },
    ],
  });
  if (isCancel(ready) || ready === "skip") return status;

  // small delay so TCC has time to register the grant
  await sleep(400);
  status = checkPermissions();
  if (status.fullDiskAccess) {
    console.log(rgb(palette.moss, "  ✓ Full Disk Access granted. Nice.\n"));
  } else {
    console.log(
      pc.yellow("  ⚠ Still blocked. Sometimes you need to fully quit and reopen the terminal."),
    );
    console.log(dim("  Continuing without FDA for now.\n"));
  }
  return status;
}
