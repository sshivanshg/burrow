/**
 * Color palette + gradient renderer.
 *
 * Uses raw 24-bit ANSI so we don't pull a heavier color lib. picocolors
 * is still used for plain styling (bold, dim, etc.) elsewhere; this
 * module is only for the fancy stuff (gradients, hex colors).
 */
import { colorEnabled } from "./tty.ts";

export type RGB = readonly [number, number, number];

export const palette = {
  // Brand: dirt → moss → spark
  dirt: [122, 80, 55] as RGB, //  earthy brown
  fur: [188, 142, 96] as RGB, //  mole fur
  moss: [88, 168, 110] as RGB, //  freed-space green
  spark: [255, 214, 102] as RGB, //  sparkle yellow
  danger: [232, 96, 96] as RGB, //  about-to-delete red
  sky: [120, 180, 230] as RGB, //  info blue
  shadow: [60, 60, 70] as RGB, //  dim
} as const;

export function hex(h: string): RGB {
  const m = h.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) throw new Error(`bad hex: ${h}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function rgb(c: RGB, s: string): string {
  if (!colorEnabled()) return s;
  return `\x1b[38;2;${c[0]};${c[1]};${c[2]}m${s}\x1b[39m`;
}

export function bgRgb(c: RGB, s: string): string {
  if (!colorEnabled()) return s;
  return `\x1b[48;2;${c[0]};${c[1]};${c[2]}m${s}\x1b[49m`;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Apply a per-character linear gradient between two colors. */
export function gradient(text: string, from: RGB, to: RGB): string {
  if (!colorEnabled()) return text;
  if (text.length === 0) return text;
  const chars = [...text];
  return chars
    .map((ch, i) => {
      const t = chars.length === 1 ? 0 : i / (chars.length - 1);
      return rgb(mix(from, to, t), ch);
    })
    .join("");
}

/**
 * Multi-stop gradient. Stops are evenly spaced across the text length.
 * Useful for fire-style (dirt → fur → spark) or freed-space (dirt → moss).
 */
export function multiGradient(text: string, stops: RGB[]): string {
  if (!colorEnabled() || stops.length < 2) return text;
  const chars = [...text];
  const segs = stops.length - 1;
  return chars
    .map((ch, i) => {
      const t = chars.length === 1 ? 0 : (i / (chars.length - 1)) * segs;
      const seg = Math.min(Math.floor(t), segs - 1);
      const local = t - seg;
      return rgb(mix(stops[seg], stops[seg + 1], local), ch);
    })
    .join("");
}

export const brand = (s: string) =>
  multiGradient(s, [palette.dirt, palette.fur, palette.spark]);

export const freed = (s: string) =>
  multiGradient(s, [palette.dirt, palette.moss, palette.spark]);

export const danger = (s: string) => rgb(palette.danger, s);
export const sky = (s: string) => rgb(palette.sky, s);
export const dim = (s: string) => rgb(palette.shadow, s);
