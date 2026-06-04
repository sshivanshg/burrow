/**
 * Animation primitives. Everything here degrades to a single plain line
 * (or no output) when animations are disabled — see ./tty.ts.
 *
 * Pieces:
 *   - Spinner            custom-frame spinner with an animated message
 *   - moleSpinner()      branded "mole digging" spinner
 *   - progressBar()      one-shot gradient progress bar string
 *   - animateBytes()     tick a byte counter up to a target value
 *   - particleBurst()    sparkle frames over an area for a duration
 *   - frameAt()          deterministic single frame (used by snapshot tests)
 *   - reveal()           type-on style reveal for headlines
 */
import { animationsEnabled, clearLines, hideCursor, showCursor, termWidth } from "./tty.ts";
import { gradient, palette, rgb, dim, multiGradient } from "./theme.ts";
import { mulberry32, sysRng, type Rng } from "./rng.ts";

// ── frame sets ─────────────────────────────────────────────────────────────
export const FRAMES = {
  /** Mole peeking + digging. Each frame is one line, ~10 cols. */
  mole: [
    "(  ◜⌣◝ )",
    "( ◜  ◝  )",
    "( ⌣ ◜  )",
    "(  ◟⌣◞ )",
    "(  ⌣⌣ )",
  ],
  /** Tunnel that grows. Useful as a "working" indicator. */
  tunnel: [
    "·         ",
    "·· ──     ",
    "·· ───    ",
    "·· ────·  ",
    "·· ─────· ",
    "·· ──────·",
  ],
  /** Classic braille spinner for places where we want neutral motion. */
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  /** Sparkle alphabet — randomized for the particle burst. */
  sparkles: ["·", "•", "✦", "✧", "★", "✨", "˖", "·"],
  /** Block characters used by the progress bar (8 levels of fill). */
  blocks: [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"],
} as const;

// ── Spinner ────────────────────────────────────────────────────────────────
export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;
  private message = "";
  private startedAt = 0;

  constructor(
    private opts: {
      frames?: readonly string[];
      fps?: number;
      color?: (s: string) => string;
      prefix?: string;
    } = {},
  ) {}

  start(message: string) {
    this.message = message;
    this.startedAt = Date.now();
    if (!animationsEnabled()) {
      process.stdout.write(`  ${message}\n`);
      return;
    }
    hideCursor();
    const frames = this.opts.frames ?? FRAMES.braille;
    const fps = this.opts.fps ?? 12;
    const color = this.opts.color ?? ((s: string) => rgb(palette.fur, s));
    const prefix = this.opts.prefix ?? "";
    this.render(color(frames[0]), prefix);
    this.timer = setInterval(() => {
      this.frameIdx = (this.frameIdx + 1) % frames.length;
      this.render(color(frames[this.frameIdx]), prefix);
    }, Math.max(1000 / fps, 30));
  }

  /** Update the message in-place without restarting the animation. */
  setMessage(m: string) {
    this.message = m;
  }

  /** Stop the spinner. `final` (if provided) replaces the line. */
  stop(final?: string, ok = true) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!animationsEnabled()) {
      if (final) process.stdout.write(`  ${final}\n`);
      return;
    }
    clearLines(1);
    const mark = ok ? rgb(palette.moss, "✓") : rgb(palette.danger, "✗");
    const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    process.stdout.write(`${mark}  ${final ?? this.message} ${dim(`(${elapsed}s)`)}\n`);
    showCursor();
  }

  private render(frame: string, prefix: string) {
    clearLines(1);
    process.stdout.write(`${prefix}${frame}  ${this.message}\n`);
  }
}

export function moleSpinner() {
  return new Spinner({
    frames: FRAMES.mole,
    fps: 6,
    color: (s) => rgb(palette.fur, s),
    prefix: " ",
  });
}

// ── progress bar ───────────────────────────────────────────────────────────
/**
 * Render a gradient progress bar. Cells use the 8-step block ramp so the
 * trailing edge animates smoothly even at narrow widths.
 */
export function progressBar(value: number, total: number, width: number): string {
  const w = Math.max(8, Math.min(width, termWidth() - 4));
  const ratio = total <= 0 ? 0 : Math.max(0, Math.min(1, value / total));
  const filledFloat = ratio * w;
  const full = Math.floor(filledFloat);
  const remainder = filledFloat - full;
  const partialIdx = Math.floor(remainder * 8);
  const bar = "█".repeat(full) + FRAMES.blocks[partialIdx] + " ".repeat(Math.max(0, w - full - 1));
  return multiGradient(bar, [palette.dirt, palette.fur, palette.moss]);
}

// ── animated byte counter ──────────────────────────────────────────────────
function humanBytes(n: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i > 0 && v < 10 ? 1 : 0)} ${u[i]}`;
}

/**
 * Tick a number up from `from` to `to` over `ms`, calling `render`
 * each frame. Uses easeOutCubic so big numbers feel satisfying.
 */
export async function animateBytes(opts: {
  from?: number;
  to: number;
  ms?: number;
  render: (value: number, formatted: string) => void;
}) {
  const from = opts.from ?? 0;
  const to = opts.to;
  const ms = opts.ms ?? 900;
  if (!animationsEnabled() || ms <= 0) {
    opts.render(to, humanBytes(to));
    return;
  }
  const fps = 30;
  const steps = Math.max(1, Math.round((ms / 1000) * fps));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = 1 - Math.pow(1 - t, 3);
    const v = from + (to - from) * eased;
    opts.render(v, humanBytes(v));
    await sleep(ms / steps);
  }
}

// ── particle burst ─────────────────────────────────────────────────────────
export interface ParticleOpts {
  width: number;
  height: number;
  count?: number;
  ms?: number;
  rng?: Rng;
  /** When provided, a static frame is returned and nothing is written. */
  staticOnly?: boolean;
}

/** Compute one deterministic particle frame. Used by snapshot tests. */
export function frameAt(opts: ParticleOpts, tick: number): string {
  const rng = opts.rng ?? mulberry32(0xb04 ^ tick);
  const count = opts.count ?? Math.max(6, Math.round((opts.width * opts.height) / 12));
  const grid: string[][] = Array.from({ length: opts.height }, () =>
    Array(opts.width).fill(" "),
  );
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * opts.width);
    const y = Math.floor(rng() * opts.height);
    const ch = FRAMES.sparkles[Math.floor(rng() * FRAMES.sparkles.length)];
    grid[y][x] = ch;
  }
  return grid.map((row) => row.join("")).join("\n");
}

/** Animate a sparkle burst for `ms` milliseconds. */
export async function particleBurst(opts: ParticleOpts) {
  if (opts.staticOnly || !animationsEnabled()) {
    const frame = frameAt(opts, 0);
    if (!opts.staticOnly) process.stdout.write(frame + "\n");
    return frame;
  }
  hideCursor();
  const fps = 18;
  const ms = opts.ms ?? 600;
  const frames = Math.max(1, Math.round((ms / 1000) * fps));
  for (let f = 0; f < frames; f++) {
    const raw = frameAt({ ...opts, rng: mulberry32(0xb04 ^ (f * 31)) }, f);
    const colored = raw
      .split("\n")
      .map((row) =>
        [...row]
          .map((ch) => {
            if (ch === " ") return ch;
            const t = (f / frames + ch.charCodeAt(0) / 256) % 1;
            const c = t < 0.5 ? palette.spark : palette.moss;
            return rgb(c, ch);
          })
          .join(""),
      )
      .join("\n");
    process.stdout.write(colored + "\n");
    await sleep(1000 / fps);
    if (f < frames - 1) clearLines(opts.height);
  }
  showCursor();
}

// ── reveal (type-on for headlines) ─────────────────────────────────────────
export async function reveal(text: string, opts: { ms?: number } = {}) {
  if (!animationsEnabled()) {
    process.stdout.write(text + "\n");
    return;
  }
  const ms = opts.ms ?? Math.min(600, text.length * 18);
  const styled = gradient(text, palette.dirt, palette.spark);
  // We can't slice the colored string mid-escape, so we re-render each step.
  const chars = [...text];
  for (let i = 1; i <= chars.length; i++) {
    process.stdout.write("\r" + gradient(chars.slice(0, i).join(""), palette.dirt, palette.spark));
    await sleep(ms / chars.length);
  }
  process.stdout.write("\r" + styled + "\n");
}

export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
