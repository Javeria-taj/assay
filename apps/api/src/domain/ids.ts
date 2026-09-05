/**
 * Id minting. The public contract enforces `stl_` and `cyc_` prefixes with a
 * minimum length, so these are the only place ids are constructed and the
 * regexes are never retyped — `CycleId.parse` / `SettlementId.parse` from
 * `@assay/contract` are the authority.
 */

/** Stable 32-bit hash. Same string in, same slug out, forever. */
function slug(seed: string, width = 8): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(width, "0").slice(0, width);
}

export const mintSettlementId = (seed: string): string => "stl_" + slug(seed);
export const mintCycleId = (seed: string): string => "cyc_" + slug(seed);
