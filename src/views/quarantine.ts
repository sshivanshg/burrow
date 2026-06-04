/**
 * Quarantine views — listBatches / restore / purge — bound up in
 * `burrowed restore` and `burrowed purge-quarantine` and a Dashboard entry.
 */
import pc from "picocolors";
import { listBatches, restoreBatch, purge } from "../core/quarantine.ts";
import { human } from "../core/size.ts";
import { brand, dim, sky, freed as freedColor, danger } from "../ui/theme.ts";

export function listQuarantine() {
  const batches = listBatches();
  if (batches.length === 0) {
    console.log(dim("  Quarantine is empty."));
    return [];
  }
  console.log(brand(`  Quarantine — ${batches.length} batch(es)`));
  console.log();
  for (const b of batches) {
    console.log(
      `  ${pc.bold(b.id)}  ${dim(b.createdAt.slice(0, 19))}  ` +
        `${freedColor(human(b.totalSize).padStart(8))}  ` +
        `${dim(`${b.items.length} item(s)`)}  ` +
        sky(b.category),
    );
  }
  console.log();
  return batches;
}

export function restoreById(id: string) {
  const batch = listBatches().find((b) => b.id === id);
  if (!batch) {
    console.log(danger(`  No quarantine batch with id ${id}.`));
    return false;
  }
  const results = restoreBatch(batch);
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  console.log(`  Restored ${freedColor(String(ok))}/${results.length} item(s).`);
  if (failed > 0) {
    console.log(danger("  Failures:"));
    for (const r of results.filter((rr) => !rr.ok)) {
      console.log(`    ${r.entry.original}  ${dim("· " + r.error)}`);
    }
  }
  return failed === 0;
}

export function purgeAll(olderThanDays?: number) {
  const r = purge({ olderThanDays });
  console.log(
    `  Purged ${freedColor(String(r.removed))} batch(es), freed ${freedColor(human(r.freed))}.`,
  );
}
