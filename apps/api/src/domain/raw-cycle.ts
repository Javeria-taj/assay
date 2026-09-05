import type { Instrument } from "./instrument.js";
import type { Paise } from "./policy.js";

/**
 * The calculator's input, in Assay's vocabulary.
 *
 * Nothing here is named after a rail. `RawCycle` is what Assay needs in order
 * to explain a settlement; it is a source's job to produce one, and no upstream
 * field name, envelope or id scheme may appear past this boundary. If a rail
 * cannot supply something, it says so in `gaps` rather than guessing.
 *
 * Money is integer paise throughout, positive on these records — the
 * calculator applies the sign. Time is epoch milliseconds; rails that speak
 * seconds are converted on the way in.
 */

/** Who the settlement belongs to. `planHeadlineBps` is her mental model, not the applied rate. */
export type RawMerchant = {
  id: string;
  name: string;
  segment: string;
  planLabel: string;
  /** The headline rate she believes she is on, in bps. 200 = flat 2%. */
  planHeadlineBps: number;
  /** Always true while Assay runs on constructed data. Rendered on screen. */
  constructed: boolean;
};

export type RawPayment = {
  id: string;
  amountPaise: Paise;
  /** The sub-type, not the family. The distinction the product turns on. */
  instrument: Instrument;
  /** What HER report calls it. Where it collapses three rails into "UPI", that collapse is the finding. */
  reportedAs: string;
  capturedAt: number;
};

export type RawRefund = {
  id: string;
  paymentId: string;
  amountPaise: Paise;
  refundedAt: number;
};

/**
 * Within one cycle every dispute carries the identical `principalPaise`.
 * The contract's chargeback line has a single `unitAmount` field and a formula
 * reading "2 disputes × ₹2,700"; two different principals would make that line
 * a lie. Vary it across cycles, never within one.
 */
export type RawDispute = {
  id: string;
  paymentId: string;
  principalPaise: Paise;
  raisedAt: number;
};

/** Chargeable, and absent from every settlement report — a failed attempt never settles. */
export type RawFailedAttempt = {
  id: string;
  instrument: Instrument;
  errorCode: string;
  attemptedAt: number;
};

/**
 * What the rail said about the settlement itself. `feesPaise` and `taxPaise`
 * are read, never computed: there is no on-demand rate anywhere in Assay and
 * there must not be one.
 */
export type RawSettlementFacts = {
  settlementId: string;
  settledAt: number;
  onDemand: boolean;
  /** Displayed only. The principal that was settled early. */
  onDemandBasePaise: Paise;
  feesPaise: Paise;
  taxPaise: Paise;
  status: "settled" | "pending";
};

/**
 * Something Assay needs and the rail did not give. The product's own finding
 * turning up in its own code, so it is a first-class value rather than a log
 * line: a line's `basisVerifiable` is false exactly when it leans on one of
 * these, and the ceiling is the sum of what they cost.
 */
export type SourceGap = {
  /**
   * Stable within a cycle. A computed line's `derivedFromGaps` and the
   * ceiling's `MissingFieldResult.gapId` both point here, which is what makes
   * the ceiling checkable rather than asserted.
   */
  id: string;
  /** Assay's name for what is missing, e.g. "instrument_sub_type". */
  field: string;
  /** Where we looked. */
  lookedIn: string;
  /** What we did instead. Never "guessed". */
  consequence: string;
  /** How many records in this cycle are affected. */
  affectedCount: number;
};

/** A cycle we could explain, cheap to list. */
export type CycleRef = {
  /**
   * The settlement this cycle landed as. Distinct from `cycleId`: the public
   * contract enforces mutually exclusive prefixes (`stl_` and `cyc_`), so one
   * id cannot serve both and neither is derivable from the other.
   */
  id: string;
  /** The accounting period. Contract-side this is the `cyc_` id. */
  cycleId: string;
  /** e.g. "August 2026". Rendered, never parsed. */
  cycleLabel: string;
  periodStart: number;
  periodEnd: number;
  settledAt: number;
  /** What the rail says actually landed. The number the waterfall must reach. */
  statedNetPaise: Paise;
};

export type RawCycle = CycleRef & {
  merchant: RawMerchant;
  payments: RawPayment[];
  refunds: RawRefund[];
  disputes: RawDispute[];
  /**
   * Records, not a count. A failed attempt never settles, so these can never
   * come from a settlement report — but they are chargeable all the same.
   */
  failedAttempts: RawFailedAttempt[];
  settlement: RawSettlementFacts;
  status: "settled" | "pending";
  /** Everything the source could not answer. Empty is the good case. */
  gaps: SourceGap[];
};
