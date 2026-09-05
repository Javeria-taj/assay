import type { Paise } from "./policy.js";

/**
 * Split `target` paise into `n` positive integer parts summing to exactly
 * `target`.
 *
 * The residual lands on the LAST element, always. That is deterministic and it
 * is why the generator shuffles the result: without a shuffle every slice ends
 * in a systematically odd-sized ticket, which reads as fake on screen.
 *
 * Without an rng the split is as even as integers allow — that is the shape
 * MEERA_CYCLE uses, so the hand-written cycle stays reproducible.
 */
export function partition(target: Paise, n: number, rng?: () => number): Paise[] {
  if (!Number.isInteger(target)) throw new Error("partition: target must be integer paise, got " + target);
  if (!Number.isInteger(n) || n < 1) throw new Error("partition: n must be a positive integer, got " + n);
  if (target < n) throw new Error("partition: cannot split " + target + "p into " + n + " parts of at least 1p");

  const base = Math.floor(target / n);
  const parts: Paise[] = new Array<Paise>(n).fill(base);

  if (rng) {
    /* Jitter each part by up to ±40% of base, keeping every part >= 1 and
     * leaving the total to be corrected by the residual below. */
    for (let i = 0; i < n; i += 1) {
      const swing = Math.floor(base * 0.4);
      const delta = swing > 0 ? Math.floor(rng() * (2 * swing + 1)) - swing : 0;
      parts[i] = Math.max(1, base + delta);
    }
  }

  const sum = parts.reduce((a, b) => a + b, 0);
  const last = parts.length - 1;
  parts[last] = (parts[last] ?? 0) + (target - sum);

  /* Jitter can push the residual negative enough to invalidate the tail. Give
   * it back from the largest parts rather than emitting a non-positive one. */
  while ((parts[last] ?? 0) < 1) {
    let biggest = 0;
    for (let i = 0; i < n; i += 1) if ((parts[i] ?? 0) > (parts[biggest] ?? 0)) biggest = i;
    if (biggest === last || (parts[biggest] ?? 0) <= 1) break;
    parts[biggest] = (parts[biggest] ?? 0) - 1;
    parts[last] = (parts[last] ?? 0) + 1;
  }

  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== target) throw new Error("partition: parts sum to " + total + "p, expected " + target + "p");
  return parts;
}
