import type { Citation } from "./computed.js";
import type { Paise } from "./policy.js";

/**
 * The explainability ceiling, on two axes that must never be collapsed.
 *
 *   amountReconciled  — do the numbers add up?      (for Meera: all of it)
 *   basisVerifiable   — can she CHECK them?          (for Meera: two thirds)
 *
 * The gap between those two is the product. Note that these are two separate
 * partitions of the same `totalDelta`, not four slices of one — a rupee sits
 * in exactly one bucket on each axis.
 */

export type CeilingBucket = {
  amount: Paise;
  /** Fraction of totalDelta, 0..1, 4dp. */
  share: number;
};

/**
 * A field that, if it existed where the decision is made, would move money
 * from unverifiable to verifiable.
 *
 * `attributableSliceIds` is what makes non-overlap checkable rather than
 * asserted: each missing field claims a set of instrument slices, the sets
 * must partition, and the ceiling stream asserts that they do. Without it,
 * "these three do not overlap and sum to the whole" is a promise in prose.
 */
export type MissingFieldResult = {
  /** The `SourceGap.id` this field corresponds to. */
  gapId: string;
  name: string;
  whyItMatters: string;
  /** Delta that becomes basis-verifiable if this field exists. */
  wouldResolve: Paise;
  /**
   * Instrument slices whose fee this field would explain. Disjoint across
   * missing fields, and together covering every unverifiable rupee.
   */
  attributableSliceIds: string[];
  citation: Citation;
};

/**
 * Volume that moved on a rail carrying zero network MDR by statute, and the
 * fee a flat plan levied on it anyway. Legal, disclosed, and on no report she
 * is given — which is why it is stated rather than accused.
 */
export type ZeroMdrExposure = {
  grossOnZeroMdrRails: Paise;
  feeLeviedOnZeroMdrRails: Paise;
  annualisedFee: Paise;
  note: string;
  citations: Citation[];
};

export type CeilingResult = {
  settlementId: string;
  /** grossCaptured − netCredited. The whole delta, not just the surprise. */
  totalDelta: Paise;

  /* Axis one: does it add up? */
  amountReconciled: CeilingBucket;
  amountUnreconciled: CeilingBucket;

  /* Axis two: can she check it? */
  basisVerifiable: CeilingBucket;
  basisUnverifiable: CeilingBucket;

  /** Sums exactly to basisUnverifiable.amount, with disjoint slice sets. */
  missingFields: MissingFieldResult[];
  /** Constructive framing. Never an accusation. */
  headline: string;
  method: string;
  zeroMdrExposure: ZeroMdrExposure;
};
