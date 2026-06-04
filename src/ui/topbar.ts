/**
 * Persistent single-row "mole tunneling across" indicator. Designed to
 * sit just below the banner and animate in place without clearing or
 * re-rendering the banner.
 *
 * Idle / done states are also one line — the topbar always reserves
 * exactly one row of vertical space.
 *
 * Layout (66 cols):
 *
 *   [tunnel ──────][mole (◜‿◝)>][unbroken dirt ▓▓▓▓▓▓▓▓]   <message> (1.2s)
 *
 * On stop:
 *
 *   ───────────────────────────────────────────(✓‿✓)   <message> (1.2s)
 */
import { rgb, palette, dim, gradient } from "./theme.ts";
import { animationsEnabled, clearLines, hideCursor, showCursor, termWidth } from "./tty.ts";
import { Spinner } from "./animations.ts";

const MOLE_FRAMES = [
  "(◜‿◝)>",
  "(◕‿◕)>",
  "(^_^)>",
  "(◔‿◔)>",
];

const TUNNEL_WIDTH_FRACTION = 0.62;

export class TopBar {
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: "idle" | "running" | "stopped" = "idle";
  private message = "";
  private startedAt = 0;
  private tick = 0;
  private progress = 0;
  private painted = false;
  private fallback: Spinner | null = null;

  start(message: string) {
    this.message = message;
    this.startedAt = Date.now();
    this.state = "running";
    this.tick = 0;
    this.progress = 0;
    if (!animationsEnabled()) {
      this.fallback = new Spinner();
      this.fallback.start(message);
      return;
    }
    hideCursor();
    this.render();
    this.timer = setInterval(() => {
      this.tick++;
      // Slow drift so the tunnel grows even without external progress.
      this.progress = Math.min(0.92, this.progress + 0.012);
      this.render();
    }, 110);
  }

  setMessage(m: string) {
    this.message = m;
    this.fallback?.setMessage(m);
  }

  setProgress(p: number) {
    this.progress = Math.max(0, Math.min(1, p));
  }

  /** Stop the animation; the line stays as a "done" state below the banner. */
  stop(final?: string, ok = true) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.fallback) {
      this.fallback.stop(final, ok);
      this.fallback = null;
      return;
    }
    this.state = "stopped";
    if (final) this.message = final;
    this.progress = 1;
    this.render(ok);
    showCursor();
  }

  private render(ok = true) {
    const w = Math.min(termWidth() - 2, 80);
    const tunnelCap = Math.floor(w * TUNNEL_WIDTH_FRACTION);
    const tunnelLen = Math.max(2, Math.floor(tunnelCap * this.progress));
    const moleFrame =
      this.state === "stopped"
        ? ok
          ? "(✓‿✓)"
          : "(x_x)"
        : MOLE_FRAMES[this.tick % MOLE_FRAMES.length];
    const moleLen = moleFrame.length;
    const dirtLen = Math.max(0, tunnelCap - tunnelLen - moleLen);

    const tunnel = gradient("─".repeat(tunnelLen), palette.shadow, palette.fur);
    const mole =
      this.state === "stopped"
        ? rgb(ok ? palette.moss : palette.danger, moleFrame)
        : rgb(palette.spark, moleFrame);
    const dirt = rgb(palette.dirt, "▓".repeat(dirtLen));

    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    const elapsedStr = dim(`(${elapsed}s)`);
    const msg =
      this.state === "stopped"
        ? rgb(palette.shadow, this.message)
        : rgb(palette.fur, this.message);

    const line = `  ${tunnel}${mole}${dirt}   ${msg} ${elapsedStr}`;

    if (this.painted) clearLines(1);
    process.stdout.write(line + "\n");
    this.painted = true;
  }
}

/** Convenience runner — like withDigger but for the topbar. */
export async function withTopBar<T>(message: string, fn: (b: TopBar) => Promise<T>): Promise<T> {
  const b = new TopBar();
  b.start(message);
  try {
    const r = await fn(b);
    b.stop();
    return r;
  } catch (e) {
    b.stop(`failed: ${(e as Error).message}`, false);
    throw e;
  }
}
