import type { Instrument } from "./instrument.js";
import type { Paise } from "./policy.js";
import type { RawMerchant } from "./raw-cycle.js";

/**
 * The engine's output, before any contract mapping.
 *
 * The mechanism worth understanding is `basisVerifiable`. It is never decided
 * by a person and never written by hand. A line is checkable exactly when its
 * basis depends on no gap the adapter reported, so it is derived — in one
 * place, `computedLine` below — from `derivedFromGaps`.
 *
 * That is why the ceiling is a finding rather than an opinion: it falls out of
 * what the rail could not answer, and if the rail starts answering, the number
 * moves on its own.
 */

/** Where a number came from. Assay's own citation, mapped to the contract's at the edge. */
export type CitationKind = "api_field" | "policy_line" | "statute" | "derived";

export type Citation = {
  kind: CitationKind;
  /** Chip text. Keep under 18 characters. */
  label: string;
  /** Policy line id, API field path, or statute reference. */
  sourceId: string;
  title: string;
  quote: string | null;
  url: string | null;
  /** Set only for policy_line: a human approved it before it computed anything. */
  approvedAt: number | null;
  approvedBy: string | null;
};

/** One named input to a formula. Money arrives pre-formatted. */
export type BasisInput = {
  label: string;
  value: string;
};

/**
 * The kinds a waterfall line can be. These are the frozen contract's
 * `LineKind` values; `to-contract.ts` asserts the two lists agree at compile
 * time so this file needs no schema import.
 */
export const LINE_KINDS = [
  "gross_captured",
  "gateway_fee",
  "refund_principal",
  "tax_on_fees",
  "failed_payment_fee",
  "chargeback_principal",
  "chargeback_fee",
  "instant_settlement_fee",
  "adjustment",
  "net_credited",
] as const;

export type LineKind = (typeof LINE_KINDS)[number];

/**
 * A computed waterfall line.
 *
 * `basisVerifiable` is readonly and absent from the constructor input: the
 * only way to obtain a `ComputedLine` is `computedLine()`, which derives it.
 */
export type ComputedLine = {
  readonly id: string;
  readonly kind: LineKind;
  readonly label: string;
  /** Signed paise. Deductions negative. */
  readonly amount: Paise;
  /** Unit count where the line is a per-event charge. */
  readonly count: number | null;
  readonly unitAmount: Paise | null;
  readonly formula: string;
  readonly inputs: BasisInput[];
  readonly citation: Citation;
  /** Is this line itemised anywhere she is given? */
  readonly onMerchantReport: boolean;
  /** Does the amount agree with the rail's own figures? */
  readonly amountReconciled: boolean;
  /**
   * Can she CHECK the rule that produced it? Derived from `derivedFromGaps`
   * by `computedLine` and by nothing else.
   */
  readonly basisVerifiable: boolean;
  /** Required whenever the basis is not checkable. Names the missing field. */
  readonly unverifiableReason: string | null;
  /** Ids of the `SourceGap`s this line's basis depends on. Empty is checkable. */
  readonly derivedFromGaps: string[];
};

/** What a caller supplies. Note the absence of `basisVerifiable`. */
export type ComputedLineInput = Omit<ComputedLine, "basisVerifiable" | "unverifiableReason"> & {
  /**
   * Required when `derivedFromGaps` is non-empty; the factory refuses
   * otherwise, because the contract will not render an unchecked line that
   * cannot say why.
   */
  unverifiableReason?: string | null;
};

export class UnverifiableWithoutReasonError extends Error {
  constructor(lineId: string, gapIds: string[]) {
    super(
      "Line " + lineId + " depends on gaps [" + gapIds.join(", ") + "] " +
        "so its basis is not verifiable, and a line that cannot be checked must say why. " +
        "Supply unverifiableReason naming the missing field.",
    );
    this.name = "UnverifiableWithoutReasonError";
  }
}

/**
 * THE one place `basisVerifiable` is decided. Nothing else in Assay may
 * compute or assign it; a line is checkable exactly when it leans on no gap.
 */
export function computedLine(input: ComputedLineInput): ComputedLine {
  const verifiable = input.derivedFromGaps.length === 0;

  if (!verifiable && !input.unverifiableReason) {
    throw new UnverifiableWithoutReasonError(input.id, input.derivedFromGaps);
  }

  return {
    ...input,
    basisVerifiable: verifiable,
    /* A checkable line has nothing to explain away. */
    unverifiableReason: verifiable ? null : (input.unverifiableReason ?? null),
  };
}

/* ---------------------------------------------------------- instrument mix */

export type ComputedInstrumentSlice = {
  /**
   * Stable within a settlement. `MissingFieldResult.attributableSliceIds`
   * points here — without it, "these missing fields do not overlap" is a
   * sentence rather than something a test can check.
   */
  id: string;
  instrument: Instrument;
  displayLabel: string;
  /** What HER report calls it. The collapse is the point, so it is carried. */
  reportedAs: string;
  grossCaptured: Paise;
  paymentCount: number;
  /** Statutory network MDR in basis points. 0 for bank-account UPI. */
  networkMdrBps: number;
  /** What this slice actually attracted under her plan. */
  feeCharged: Paise;
  /** True when this slice is indistinguishable from another in her report. */
  collapsedInReport: boolean;
  citation: Citation;
};

/* -------------------------------------------------------------- settlement */

export type Reconciliation = {
  ok: boolean;
  /** Sum of the signed lines. */
  computedNet: Paise;
  /** What the rail says landed. */
  statedNet: Paise;
  /** computedNet − statedNet. Must be 0. */
  delta: Paise;
};

export type ComputedSettlement = {
  readonly cycleId: string;
  readonly settlementId: string;
  readonly cycleLabel: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly settledAt: number;
  readonly merchant: RawMerchant;

  readonly grossCaptured: Paise;
  readonly netCredited: Paise;
  /** Gross − headline rate − refunds. Her mental model, not the truth. */
  readonly merchantExpected: Paise;
  readonly expectationBasis: string;
  /** merchantExpected − netCredited. */
  readonly unexplainedGap: Paise;

  readonly lines: ComputedLine[];
  readonly instrumentMix: ComputedInstrumentSlice[];
  readonly reconciliation: Reconciliation;
  readonly policyId: string;
};

export class ReconciliationFailedError extends Error {
  constructor(readonly delta: Paise, readonly computedNet: Paise, readonly statedNet: Paise) {
    super(
      "Waterfall does not reconcile: computed " + computedNet + "p against stated " + statedNet +
        "p, delta " + delta + "p. Assay refuses to return a settlement it cannot stand behind.",
    );
    this.name = "ReconciliationFailedError";
  }
}

/**
 * The engine's exit. A settlement whose lines do not sum to what the rail says
 * landed does not get returned — it throws. Rendering a number that does not
 * add up is the one failure this product cannot survive.
 */
export function computedSettlement(
  settlement: Omit<ComputedSettlement, "reconciliation"> & { statedNet: Paise },
): ComputedSettlement {
  const computedNet = settlement.lines
    .filter((l) => l.kind !== "net_credited")
    .reduce((sum, l) => sum + l.amount, 0);

  const delta = computedNet - settlement.statedNet;
  if (delta !== 0) throw new ReconciliationFailedError(delta, computedNet, settlement.statedNet);

  const { statedNet, ...rest } = settlement;
  return { ...rest, reconciliation: { ok: true, computedNet, statedNet, delta } };
}
