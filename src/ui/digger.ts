/**
 * Multi-row "mole digging through dirt" animation. Instead of a one-line
 * spinner, this paints a 5-row scene:
 *
 *     row 0:  grass + dirt clods being flung up
 *     row 1:  packed dirt
 *     row 2:  tunnel that the mole has already dug (grows left)
 *     row 3:  the mole, with a helmet light, drilling rightward
 *     row 4:  packed dirt below
 *
 * The mole pulses through a few frames. The tunnel grows over time so
 * it visually feels like progress is being made.
 *
 * Renders in place using ANSI cursor-up; degrades to a plain spinner
 * when animations are disabled.
 */
import { rgb, palette, gradient, dim } from "./theme.ts";
import { animationsEnabled, hideCursor, showCursor, clearLines, termWidth } from "./tty.ts";
import { Spinner, sleep } from "./animations.ts";

// Mole frames. Each is 3 lines tall. We render them centered into a
// 5-row scene with dirt above and below.
const MOLE_FRAMES = [
  [
    "  ___",
    " (◜‿◝)>",
    "  ⌒⌒",
  ],
  [
    "  ___",
    " (◕‿◕)>",
    "  ⌒⌒",
  ],
  [
    "  ___",
    " (^_^)>",
    "  ⌒⌒",
  ],
  [
    "  ___",
    " (◔‿◔)>",
    "  ⌒⌒",
  ],
];

// Dirt-clod glyphs used along the top row when a clod is "flung up".
const CLOD_GLYPHS = ["·", "•", "˚", "◦", "○"];

interface DiggerState {
  message: string;
  tick: number;
  /** 0..1 progress hint; controls how far the tunnel has dug. */
  progress: number;
}

export class Digger {
  private state: DiggerState = { message: "", tick: 0, progress: 0 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private rowsPainted = 0;
  private fallbackSpinner: Spinner | null = null;

  start(message: string) {
    this.state = { message, tick: 0, progress: 0 };
    this.startedAt = Date.now();
    if (!animationsEnabled()) {
      this.fallbackSpinner = new Spinner();
      this.fallbackSpinner.start(message);
      return;
    }
    hideCursor();
    this.paint();
    this.timer = setInterval(() => {
      this.state.tick++;
      // Slowly advance progress so the tunnel grows even without external signal.
      this.state.progress = Math.min(0.95, this.state.progress + 0.01);
      this.paint();
    }, 110);
  }

  setMessage(m: string) {
    this.state.message = m;
    this.fallbackSpinner?.setMessage(m);
  }

  /** External callers can nudge the tunnel-growth (0..1). */
  setProgress(p: number) {
    this.state.progress = Math.max(0, Math.min(1, p));
  }

  stop(final?: string, ok = true) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.fallbackSpinner) {
      this.fallbackSpinner.stop(final, ok);
      this.fallbackSpinner = null;
      return;
    }
    if (this.rowsPainted > 0) clearLines(this.rowsPainted);
    this.rowsPainted = 0;
    const mark = ok ? rgb(palette.moss, "✓") : rgb(palette.danger, "✗");
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    console.log(`${mark}  ${final ?? this.state.message} ${dim(`(${elapsed}s)`)}`);
    showCursor();
  }

  private paint() {
    const w = Math.min(termWidth(), 80) - 2;
    const tunnelLen = Math.max(4, Math.floor(w * this.state.progress * 0.7));
    const moleFrame = MOLE_FRAMES[this.state.tick % MOLE_FRAMES.length];
    const clodPos = this.state.tick % 7;

    // ── row 0: grass + flung dirt ──
    const grassRow: string[] = Array(w).fill(" ");
    for (let i = 0; i < 3; i++) {
      const cx = (clodPos + i * 2) % w;
      grassRow[cx] = rgb(palette.fur, CLOD_GLYPHS[(this.state.tick + i) % CLOD_GLYPHS.length]);
    }
    const row0 = grassRow.join("");

    // ── row 1: packed dirt ──
    const row1 = gradient("▒".repeat(w), palette.dirt, palette.fur);

    // ── row 2 (above mole): tunnel that's been dug ──
    const tunnel = " ".repeat(tunnelLen);
    const remainingDirt = Math.max(0, w - tunnelLen - 4);
    const row2 =
      tunnel + rgb(palette.dirt, "▓".repeat(remainingDirt + 4));

    // ── row 3: the mole itself ──
    // Build a clean tunnel on the left where the mole has come from, then
    // the mole sprite at the tunnel head, then unbroken dirt to the right.
    const moleX = Math.max(0, tunnelLen - 8);
    const moleSpriteLines = moleFrame;
    // We're collapsing the mole's 3 rows into our row 2/3/4 by overlaying
    // its 3 lines on those three scene rows.
    const moleLine0 = moleSpriteLines[0]; // "  ___"
    const moleLine1 = moleSpriteLines[1]; // " (◜‿◝)>"
    const moleLine2 = moleSpriteLines[2]; // "  ⌒⌒"

    function overlayRow(scene: string, sprite: string, startX: number, color: (s: string) => string): string {
      // Strip ANSI for length math is hard; we'll rebuild from raw.
      const sceneChars = Array.from(plain(scene));
      const sceneRaw = Array(w).fill(" ");
      // Re-render scene-row plainly as ▓ from moleX-area onward, then overlay.
      for (let i = 0; i < w; i++) sceneRaw[i] = i < startX || i >= startX + sprite.length ? "▓" : " ";
      const out: string[] = [];
      for (let i = 0; i < w; i++) {
        if (i >= startX && i < startX + sprite.length) {
          const ch = sprite[i - startX];
          if (ch === " ") out.push(rgb(palette.shadow, " "));
          else out.push(color(ch));
        } else if (i < startX) {
          out.push(rgb(palette.shadow, " ")); // already-dug tunnel behind mole
        } else {
          out.push(rgb(palette.dirt, "▓")); // unbroken dirt ahead
        }
      }
      return out.join("");
    }

    const row2Mole = overlayRow(row2, moleLine0, moleX, (s) => rgb(palette.fur, s));
    const row3Mole = overlayRow(row2, moleLine1, moleX, (s) => rgb(palette.spark, s));
    const row4Mole = overlayRow(row2, moleLine2, moleX, (s) => rgb(palette.fur, s));

    // ── row 5: status text ──
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    const statusRow = `  ${rgb(palette.fur, "⛏")}  ${this.state.message} ${dim(`(${elapsed}s)`)}`;

    if (this.rowsPainted > 0) clearLines(this.rowsPainted);
    const lines = [row0, row1, row2Mole, row3Mole, row4Mole, statusRow];
    for (const line of lines) console.log(line);
    this.rowsPainted = lines.length;
  }
}

/** Drop ANSI sequences so we can length-check a styled string. */
function plain(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Run a thunk while showing the digger. Auto-stops on success or throw. */
export async function withDigger<T>(message: string, fn: (d: Digger) => Promise<T>): Promise<T> {
  const d = new Digger();
  d.start(message);
  try {
    const result = await fn(d);
    d.stop();
    return result;
  } catch (e) {
    d.stop(`failed: ${(e as Error).message}`, false);
    throw e;
  }
}
