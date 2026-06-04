/**
 * Deterministic seedable RNG. Used by animations so snapshot tests
 * produce identical particle layouts.
 *
 * Mulberry32 — small, fast, good distribution for our toy use.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sysRng: Rng = Math.random;
