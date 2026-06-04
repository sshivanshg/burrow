/**
 * Generic interactive picker for ANY cleaner's findings. Used by
 * `burrow clean <category>`, `burrow uninstall <app>`, and the
 * dashboard drill-in.
 */
import pc from "picocolors";
import { multiselect, confirm, note, isCancel, cancel } from "@clack/prompts";
import { relative } from "node:path";
import type { Cleaner, CleanOpts, Finding, ScanOpts } from "../core/types.ts";
import { human } from "../core/size.ts";
import { animateBytes, particleBurst } from "./animations.ts";
import { Digger } from "./digger.ts";
import { brand, freed as freedColor, sky, dim } from "./theme.ts";
import { quarantineBatch } from "../core/quarantine.ts";
import { record as recordHistory } from "../core/history.ts";

interface RunOpts {
  cleaner: Cleaner;
  scanOpts: ScanOpts & { appName?: string };
  dryRun: boolean;
  json: boolean;
  list: boolean;
  yes: boolean;
  /** Move to ~/.burrow-quarantine instead of rm. */
  quarantine?: boolean;
  /** Used to render relative paths nicely. */
  displayRoot?: string;
}

export async function runCleaner(opts: RunOpts) {
  const { cleaner, scanOpts, displayRoot } = opts;
  const root = displayRoot ?? scanOpts.root ?? "/";

  const sp = new Digger();
  sp.start(`Digging through ${cleaner.meta.title}…`);
  const findings = await cleaner.scan(scanOpts);
  sp.stop(`Found ${pc.bold(String(findings.length))} ${cleaner.meta.id} item(s).`);

  if (findings.length === 0) {
    if (opts.json) console.log(JSON.stringify({ cleaner: cleaner.meta.id, findings: [], total: 0 }));
    else note("Nothing to dig up here.", "✨");
    return { ran: false, removed: 0, freed: 0, failed: 0 };
  }

  const total = findings.reduce((s, f) => s + f.size, 0);
  if (opts.json) {
    console.log(JSON.stringify({ cleaner: cleaner.meta.id, findings, total }, null, 2));
    return { ran: false, removed: 0, freed: 0, failed: 0 };
  }

  note(`${pc.bold(human(total))} reclaimable across ${findings.length} item(s)`, "💾 Potential savings");

  if (opts.list) {
    renderList(findings, root);
    return { ran: false, removed: 0, freed: 0, failed: 0 };
  }

  let selected: Finding[];
  if (opts.yes) {
    selected = findings.filter((f) => cleaner.isSafeToDelete(f.path, scanOpts));
  } else {
    const longest = Math.max(...findings.map((f) => human(f.size).length));
    const picked = await multiselect({
      message: "Select what to delete (space toggles, enter confirms):",
      options: findings.map((f) => ({
        value: f.path,
        label: `${pc.yellow(human(f.size).padStart(longest))}  ${pc.bold(f.label)} ${dim(shortPath(f.path, root))}`,
        hint: f.description,
      })),
      initialValues: findings.filter((f) => f.safe).map((f) => f.path),
      required: false,
    });
    if (isCancel(picked)) {
      cancel("Cancelled — nothing deleted.");
      return { ran: false, removed: 0, freed: 0, failed: 0 };
    }
    selected = findings.filter(
      (f) => (picked as string[]).includes(f.path) && cleaner.isSafeToDelete(f.path, scanOpts),
    );
  }
  if (selected.length === 0) {
    note("Nothing selected — exiting.", dim("·"));
    return { ran: false, removed: 0, freed: 0, failed: 0 };
  }

  const freeing = selected.reduce((s, f) => s + f.size, 0);

  if (opts.dryRun) {
    note(
      selected.map((f) => `${dim("would remove")} ${shortPath(f.path, root)}`).join("\n"),
      `🧪 Dry run — ${human(freeing)} would be freed`,
    );
    return { ran: true, removed: selected.length, freed: 0, failed: 0 };
  }

  if (!opts.yes) {
    const go = await confirm({
      message: `Delete ${pc.bold(String(selected.length))} item(s) and reclaim ${pc.green(human(freeing))}?`,
      initialValue: false,
    });
    if (isCancel(go) || !go) {
      cancel("Cancelled — nothing deleted.");
      return { ran: false, removed: 0, freed: 0, failed: 0 };
    }
  }

  const del = new Digger();
  const startedAt = Date.now();
  let removed = 0;
  let freed = 0;
  let failed = 0;

  if (opts.quarantine) {
    del.start("Quarantining (move to ~/.burrow-quarantine)…");
    // Filter again through the cleaner's own safety check, just in case.
    const safe = selected.filter((f) => cleaner.isSafeToDelete(f.path, scanOpts));
    const batch = quarantineBatch(
      cleaner.meta.id,
      safe.map((f) => ({ path: f.path, size: f.size })),
    );
    removed = batch.items.length;
    freed = batch.totalSize;
    failed = selected.length - removed;
    del.stop(`Quarantined ${removed} item(s) — batch ${batch.id.split("_")[0]}.`);
    console.log(dim(`  Restore with: burrow restore ${batch.id}`));
  } else {
    del.start("Filling in the burrow…");
    const cleanOpts: CleanOpts & ScanOpts = {
      ...scanOpts,
      dryRun: false,
      onProgress: (n, t, f) => del.setMessage(`Removed ${n}/${t} — ${human(f)} freed`),
    };
    const result = await cleaner.clean(selected, cleanOpts);
    del.stop(`Removed ${result.removed} item(s).`);
    removed = result.removed;
    freed = result.freed;
    failed = result.failed;
  }

  await animateBytes({
    to: freed,
    ms: 700,
    render: (_, str) => process.stdout.write("\r  " + freedColor(`Reclaimed ${str}`) + "        "),
  });
  process.stdout.write("\n");
  if (freed > 1024 * 1024) {
    await particleBurst({ width: Math.min(60, process.stdout.columns ?? 60), height: 3, count: 24, ms: 500 });
  }

  recordHistory({
    ts: new Date().toISOString(),
    category: cleaner.meta.id,
    removed,
    failed,
    freed,
    dryRun: false,
    quarantined: !!opts.quarantine,
    durationMs: Date.now() - startedAt,
  });

  return { ran: true, removed, freed, failed };
}

function renderList(findings: Finding[], root: string) {
  const longest = Math.max(...findings.map((f) => human(f.size).length));
  for (const f of findings) {
    console.log(
      `${pc.yellow(human(f.size).padStart(longest))}  ${pc.bold(f.label)} ${dim(shortPath(f.path, root))}`,
    );
  }
}

function shortPath(p: string, root: string): string {
  try {
    const rel = relative(root, p);
    if (rel && !rel.startsWith("..")) return rel || ".";
  } catch {}
  return p;
}
