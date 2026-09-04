import type { Instrument } from "./instrument.js";

/**
 * The calculator's input, in Assay's vocabulary.
 *
 * Nothing here is named after a rail. `RawCycle` is what Assay needs in order
 * to explain a settlement; it is a source's job to produce one, and no
 * upstream field name, envelope or id scheme may appear past this boundary.
 * If a rail cannot supply something, it says so in `gaps` rather than guessing.
 *
 * Money is integer paise throughout, deductions negative. Time is epoch
 * milliseconds; rails that speak seconds are converted on the way in.
 *
 * Nothing here imports a schema. The mappers in engine/to-contract.ts are the
 * only place the public contract is known.
 */

/**
 * Who the settlement belongs to. The source knows this; the calculator needs
 * `headlineBps` to compute what she expected, and the contract's Explanation
 * cannot be built without the rest.
 */
export type MerchantRef = {
  id: string;
  name: string;
  segment: string;
  planLabel: string;
  /** The headline rate she believes she is on, in bps. 200 = flat 2%. */
  headlineBps: number;
  /** Always true while Assay runs on constructed data. Rendered on screen. */
  constructed: boolean;
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
  label: string;
  periodStart: number;
  periodEnd: number;
  settledAt: number;
  /** What the rail says actually landed. The number the waterfall must reach. */
  statedNet: number;
};

/**
 * One captured payment. `instrument` is the sub-type, not the family — the
 * distinction the whole product turns on.
 */
export type CapturedPayment = {
  id: string;
  amount: number;
  capturedAt: number;
  instrument: Instrument;
  /**
   * What the merchant's own settlement report calls this payment. Where it
   * collapses several instruments into one word — "UPI" — that collapse is the
   * finding, so it is carried rather than resolved.
   */
  reportedAs: string;
  /**
   * Fee the rail says it charged on this payment, when it says so at all.
   * Null means the rail did not attribute a fee to this line, which is itself
   * worth knowing: it is why a per-line basis cannot be checked.
   */
  feeCharged: number | null;
  taxOnFee: number | null;
};

export type Refund = {
  id: string;
  /** Positive here. The calculator applies the sign. */
  amount: number;
  paymentId: string | null;
  refundedAt: number;
};

export type Dispute = {
  id: string;
  /** The principal actually taken off the settlement, not the amount contested. */
  amountDeducted: number;
  paymentId: string | null;
  /** The rail's own word for the stage. Rendered, never branched on for money. */
  stage: string;
  raisedAt: number;
};

/**
 * An on-demand settlement, and the reason §4.1 exists. `fees` and `tax` are
 * read off the rail's response. There is deliberately no rate for these
 * anywhere in Assay: a rate we typed in is a rate that can be wrong.
 */
export type OnDemandSettlement = {
  id: string;
  amountRequested: number;
  amountSettled: number;
  /** Read from the rail. Never computed. */
  fees: number;
  /** Read from the rail. Never computed. */
  tax: number;
  requestedAt: number;
};

/**
 * Something Assay needs and the rail did not give. This is the product's own
 * finding turning up in its own code, so it is a first-class value rather than
 * a log line: the ceiling analysis reads it.
 */
export type SourceGap = {
  /**
   * Stable within a cycle. `ComputedLine.derivedFromGaps` and
   * `MissingFieldResult.gapId` both point here, which is what makes the
   * ceiling checkable rather than asserted.
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

export type RawCycle = CycleRef & {
  merchant: MerchantRef;
  payments: CapturedPayment[];
  refunds: Refund[];
  disputes: Dispute[];
  /**
   * Attempts that failed. A count, not a list: the charge is per attempt and
   * the individual attempts are not otherwise interesting.
   */
  failedAttemptCount: number;
  onDemandSettlements: OnDemandSettlement[];
  /** Everything the source could not answer. Empty is the good case. */
  gaps: SourceGap[];
};
