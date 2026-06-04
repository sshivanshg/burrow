/**
 * Optimize view — privileged ops that don't fit the "scan + pick + clean"
 * pattern. Each runs via osascript admin (TouchID-friendly) and reports
 * back.
 *
 * Operations:
 *   purge-memory         Inactive memory back to OS  (`purge`)
 *   flush-dns            Restart mDNSResponder, clear DNS cache
 *   erase-system-logs    Wipe unified log archive    (`log erase --all`)
 *   purge-tm-snapshots   Thin local Time Machine snapshots
 *
 * Each requires admin; we surface a single auth dialog. If the user has
 * "Use Touch ID for sudo" enabled, that dialog accepts a fingerprint.
 */
import pc from "picocolors";
import { runWithAdmin, hasTouchIDForSudo } from "../core/sudo.ts";
import { brand, dim, sky, freed as freedColor, danger, palette, rgb } from "../ui/theme.ts";
import { showMenu, type MenuItem } from "../ui/menu.ts";
import { record as recordHistory } from "../core/history.ts";

interface Op {
  id: string;
  title: string;
  description: string;
  reason: string;
  command: string;
}

const OPS: Op[] = [
  {
    id: "purge-memory",
    title: "Purge inactive memory",
    description: "Return inactive memory to the OS",
    reason: "burrow wants to purge inactive memory",
    command: "/usr/sbin/purge",
  },
  {
    id: "flush-dns",
    title: "Flush DNS cache",
    description: "Clear the system DNS resolver cache",
    reason: "burrow wants to flush the DNS cache",
    command: "/usr/bin/dscacheutil -flushcache && /usr/bin/killall -HUP mDNSResponder",
  },
  {
    id: "erase-system-logs",
    title: "Erase unified logs",
    description: "Wipe the macOS unified logging archive",
    reason: "burrow wants to erase the system log archive",
    command: "/usr/bin/log erase --all",
  },
  {
    id: "purge-tm-snapshots",
    title: "Thin Time Machine snapshots",
    description: "Reclaim space taken by local Time Machine backups",
    reason: "burrow wants to thin local Time Machine snapshots",
    command: "/usr/bin/tmutil thinlocalsnapshots / 100000000000 4",
  },
];

export async function runOptimize() {
  console.log(brand("  Optimize") + dim(" — privileged tune-ups."));
  console.log();
  if (hasTouchIDForSudo()) {
    console.log(rgb(palette.moss, "  ✓ Touch ID for sudo detected. The auth dialog will accept your fingerprint.\n"));
  } else {
    console.log(
      dim(
        "  ℹ Tip: enable Touch ID in System Settings → Touch ID & Password → 'Use Touch ID for sudo'.\n",
      ),
    );
  }

  const items: MenuItem[] = [
    ...OPS.map((o) => ({ value: o.id, label: o.title, description: o.description })),
    { value: "all", label: "Run all", description: "Sequence every operation" },
    { value: "back", label: "Back", description: "Return to main menu" },
  ];

  const pick = await showMenu({ items });
  if (!pick || pick === "back") return;

  const toRun: Op[] = pick === "all" ? OPS : OPS.filter((o) => o.id === pick);
  for (const op of toRun) {
    console.log();
    console.log(sky(`  ▸ ${op.title}`));
    const startedAt = Date.now();
    const r = await runWithAdmin(op.command, op.reason);
    if (r.cancelled) {
      console.log(danger("    cancelled by user"));
      break;
    }
    if (r.ok) {
      console.log(freedColor("    ✓ done") + dim(` (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`));
      if (r.stdout.trim()) console.log(dim(indent(r.stdout.trim(), 6)));
      recordHistory({
        ts: new Date().toISOString(),
        category: `optimize:${op.id}`,
        removed: 1,
        failed: 0,
        freed: 0,
        dryRun: false,
        quarantined: false,
        durationMs: Date.now() - startedAt,
      });
    } else {
      console.log(danger("    ✗ failed"));
      if (r.stderr.trim()) console.log(dim(indent(r.stderr.trim(), 6)));
    }
  }
}

function indent(s: string, n: number): string {
  const pad = " ".repeat(n);
  return s
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}
