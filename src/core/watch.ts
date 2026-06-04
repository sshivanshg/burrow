/**
 * Watch mode — background polling that fires a notification when disk
 * crosses a threshold. Designed to be either:
 *
 *   - run in the foreground (Ctrl-C to stop), or
 *   - put under launchd by `burrowed schedule` for true background use.
 */
import { diskInfo } from "./disk.ts";
import { notify } from "./notify.ts";
import { human } from "./size.ts";

export interface WatchOpts {
  thresholdPercent: number;
  intervalSec: number;
  /** Stop after N ticks (test hook). */
  maxTicks?: number;
  onTick?: (status: { usedPercent: number; available: number; total: number }) => void;
}

export async function watch(opts: WatchOpts) {
  let lastNotifiedDay = "";
  let ticks = 0;
  console.log(`burrowed watch · threshold ${opts.thresholdPercent}% · interval ${opts.intervalSec}s`);
  while (true) {
    const d = diskInfo();
    if (d) {
      const usedPercent = (d.used / d.total) * 100;
      opts.onTick?.({ usedPercent, available: d.available, total: d.total });
      console.log(
        `[${new Date().toISOString()}] ${usedPercent.toFixed(1)}% used · ${human(d.available)} free`,
      );
      const day = new Date().toISOString().slice(0, 10);
      if (usedPercent >= opts.thresholdPercent && day !== lastNotifiedDay) {
        notify(
          "burrow: disk pressure",
          `${usedPercent.toFixed(0)}% full · ${human(d.available)} free — run \`burrow\` to reclaim.`,
        );
        lastNotifiedDay = day;
      }
    }
    ticks++;
    if (opts.maxTicks && ticks >= opts.maxTicks) return;
    await sleep(opts.intervalSec * 1000);
  }
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
