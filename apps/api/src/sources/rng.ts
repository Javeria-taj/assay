/**
 * A seeded pseudo-random generator, in arithmetic only.
 *
 * Nothing in this file reads a clock, and nothing draws on the host's own
 * source of randomness. Every value it produces is a pure function of a seed
 * string, which is the property that lets a generated cycle be reproduced on
 * someone else's machine, in CI, or six weeks later, from nothing but the
 * thirteen characters of a seed.
 *
 * The reason `rngFor` takes a *string* rather than a number is sub-streams.
 * Draw payments, timestamps, refunds, disputes and failed attempts from
 * `rngFor(seed + ":payments")`, `rngFor(seed + ":timestamps")` and so on —
 * never from one shared generator. Share one and adding a single refund shifts
 * every payment amount downstream of it, and the canonical seed quietly stops
 * reproducing. That is a long debugging session bought for nothing.
 */

/**
 * FNV-1a, 32-bit. Same string in, same uint32 out, forever.
 *
 * `Math.imul` is what keeps the multiply in 32-bit space; a plain `*` loses
 * the low bits to float rounding above 2^53 and the hash stops being stable.
 */
export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  /* A zero state makes mulberry32 degenerate. Nudge it off zero. */
  return h === 0 ? 0x9e3779b9 : h;
}

/** mulberry32. Returns a generator of floats in [0, 1). */
export function mulberry32(a: number): () => number {
  let state = a >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience: `rngFor("meera-2026-08:payments")`. */
export function rngFor(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}

/** Inclusive integer in [lo, hi]. Throws when hi < lo. */
export function intBetween(rng: () => number, lo: number, hi: number): number {
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
    throw new Error("intBetween: bounds must be integers, got " + lo + " and " + hi);
  }
  if (hi < lo) throw new Error("intBetween: hi " + hi + " is below lo " + lo);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Uniform pick. Throws on an empty array. */
export function pick<T>(rng: () => number, xs: readonly T[]): T {
  if (xs.length === 0) throw new Error("pick: cannot pick from an empty array");
  const chosen = xs[intBetween(rng, 0, xs.length - 1)];
  if (chosen === undefined) throw new Error("pick: index fell outside the array");
  return chosen;
}

/** Fisher–Yates. Returns a NEW array; the input is never mutated. */
export function shuffled<T>(rng: () => number, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = intBetween(rng, 0, i);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) throw new Error("shuffled: index fell outside the array");
    out[i] = b;
    out[j] = a;
  }
  return out;
}
