import {
  CITATIONS,
  bps,
  formatPaise,
  rupees,
  type Citation,
  type Explanation,
  type ExplanationLine,
  type LineKind,
  type Paise,
  type Policy,
} from "@assay/contract";
import { GATEWAY_FEE_UNVERIFIABLE_REASON } from "../domain/copy.js";
import { seal, type LineDraft } from "../domain/lines.js";
import type { RawCycle, RawDispute } from "../domain/raw-cycle.js";
import { instrumentMix } from "./instrument-mix.js";
import { applyPolicy, onDemandFee, perEventFee, taxOnFees } from "./policy-apply.js";

/**
 * The settlement calculator. A `RawCycle` and an approved `Policy` in, a
 * contract-valid `Explanation` out.
 *
 * Pure: no HTTP, no env, no clock, no randomness, no I/O. Called twice with the
 * same inputs it returns deeply equal values, which is what lets the route
 * layer memoise it and the invariant checker replay it.
 *
 * Two paths do not return a payload at all:
 *   ReconcileError          the signed lines do not sum to what the rail says
 *                           landed. A returned Explanation ALWAYS carries
 *                           delta 0; the non-zero case is a refusal, because a
 *                           merchant acting on a number that does not add up is
 *                           worse off than one we showed nothing.
 *   PolicyNotApprovedError  a rule reached the engine without a human's name
 *                           on it.
 * Both propagate out for the route layer to map onto the contract's error codes.
 *
 * See `policy-apply.ts` for the aggregation decision every figure below rests on.
 */

const FAILED_ATTEMPT_LINE = "P-03";
const CHARGEBACK_FEE_LINE = "P-04";

const RUPEE_SIGN = "₹";

/** "L-00" … "L-08". Positional, so the ids cannot drift from the order. */
const lineId = (i: number): string => "L-" + String(i).padStart(2, "0");

/**
 * Indian digit grouping for a plain count: 1100 -> "1,100", 960 -> "960".
 *
 * Routed through the contract's own money formatter rather than a second
 * grouping implementation, so a count and a rupee amount can never group
 * differently on the same screen.
 */
const fmtCount = (n: number): string =>
  formatPaise(rupees(n), { paise: false }).replace(RUPEE_SIGN, "");

/* ------------------------------------------------------------ verifiability */

/**
 * Which declared source gap each kind of line leans on.
 *
 * `basisVerifiable` is DERIVED, never assigned. A line is unverifiable exactly
 * when its computation leaned on something the source said it could not give
 * us — read off `cycle.gaps` — and not because somebody hardcoded `false` on
 * the gateway-fee line. Hardcoding it would make the ceiling an assertion about
 * this fixture rather than a measurement of any cycle: a source that DID return
 * the instrument sub-type would still be reported as unverifiable.
 */
const GAP_EXPOSURE: Readonly<Partial<Record<LineKind, readonly string[]>>> = {
  gateway_fee: ["instrument_sub_type"],
};

/** The merchant-facing sentence for each gap. Copy lives in `domain/copy.ts`. */
const GAP_REASON: Readonly<Record<string, string>> = {
  instrument_sub_type: GATEWAY_FEE_UNVERIFIABLE_REASON,
};

type Verifiability = Pick<ExplanationLine, "basisVerifiable" | "unverifiableReason">;

/** The one place in this stream that decides whether a basis can be checked. */
function verifiability(kind: LineKind, cycle: RawCycle): Verifiability {
  const exposedTo = GAP_EXPOSURE[kind] ?? [];
  const leanedOn = cycle.gaps.find((gap) => exposedTo.includes(gap.field));
  if (!leanedOn) return { basisVerifiable: true, unverifiableReason: null };
  return {
    basisVerifiable: false,
    unverifiableReason: GAP_REASON[leanedOn.field] ?? leanedOn.consequence,
  };
}

/* ------------------------------------------------------------------ helpers */

/**
 * The per-dispute principal, read off the disputes collection and not off a
 * policy line — no approved rule sets it.
 *
 * The contract's chargeback line carries a single `unitAmount` beside a formula
 * reading "2 disputes × ₹2,700". Two different principals in one cycle would
 * make that line a lie, so we refuse rather than render an average.
 */
function uniformDisputePrincipal(disputes: readonly RawDispute[]): Paise | null {
  const first = disputes[0];
  if (!first) return null;
  for (const d of disputes) {
    if (d.principalPaise !== first.principalPaise) {
      throw new Error(
        "Dispute " +
          d.id +
          " carries a principal of " +
          formatPaise(d.principalPaise) +
          " but " +
          first.id +
          " carries " +
          formatPaise(first.principalPaise) +
          ". One cycle, one principal — the chargeback line has a single unitAmount.",
      );
    }
  }
  return first.principalPaise;
}

/** A line before its id, its verifiability and its running balance are known. */
type LineSpec = {
  kind: LineKind;
  label: string;
  amount: Paise;
  count: number | null;
  unitAmount: Paise | null;
  formula: string;
  inputs: ReadonlyArray<{ label: string; value: string }>;
  citation: Citation;
  onMerchantReport: boolean;
};

/* -------------------------------------------------------------- the engine */

export function calculate(cycle: RawCycle, policy: Policy): Explanation {
  /* First, before a single rupee: every rule carries a human's approval. */
  const p = applyPolicy(policy);

  const mix = instrumentMix(cycle, p);

  const grossCaptured = cycle.payments.reduce((a, payment) => a + payment.amountPaise, 0);

  /* DEFINED as the sum of the slices — see the aggregation note in
   * policy-apply.ts. Not one bps() call on the aggregate, which is a fact about
   * tonight's mix and is asserted as such in the test. */
  const gatewayFee = mix.reduce((a, slice) => a + slice.feeCharged, 0);

  const refundPrincipal = cycle.refunds.reduce((a, refund) => a + refund.amountPaise, 0);
  const gstOnFees = taxOnFees(gatewayFee, p);

  const failedCount = cycle.failedAttempts.length;
  const failedUnit = p.fixed(FAILED_ATTEMPT_LINE);
  const failedFees = perEventFee(failedCount, FAILED_ATTEMPT_LINE, p);

  const disputeCount = cycle.disputes.length;
  const disputeUnitPrincipal = uniformDisputePrincipal(cycle.disputes);
  const chargebackPrincipal = cycle.disputes.reduce((a, d) => a + d.principalPaise, 0);
  const chargebackUnitFee = p.fixed(CHARGEBACK_FEE_LINE);
  const chargebackFees = perEventFee(disputeCount, CHARGEBACK_FEE_LINE, p);

  const onDemandTotal = onDemandFee(cycle.settlement, p);

  /* Her mental model uses the plan's HEADLINE rate, never P-01. They are both
   * 2% tonight and they are kept apart in code on purpose: collapse them and
   * the product can never show a plan that differs from the applied rate, which
   * is the single most interesting thing it could ever show. */
  const headlineBps = cycle.merchant.planHeadlineBps;
  const merchantExpected = grossCaptured - bps(grossCaptured, headlineBps) - refundPrincipal;

  /* Derived, never typed: "2", "2.00", "18". */
  const feeRateBps = p.rate("P-01");
  const feePercent = String(feeRateBps / 100);
  const feePercent2dp = (feeRateBps / 100).toFixed(2);
  const gstPercent = String(p.rate("P-02") / 100);
  const headlinePercent = String(headlineBps / 100);

  const above: LineSpec[] = [
    {
      kind: "gross_captured",
      label: "Gross captured",
      amount: grossCaptured,
      count: cycle.payments.length,
      unitAmount: null,
      formula: "sum(payment.amount) over payments captured in the cycle",
      inputs: [{ label: "Captured payments", value: fmtCount(cycle.payments.length) }],
      citation: CITATIONS.capturedApi,
      onMerchantReport: true,
    },
    {
      kind: "gateway_fee",
      label: "Gateway fee at " + feePercent + "%",
      amount: -gatewayFee,
      count: null,
      unitAmount: null,
      formula: feePercent2dp + "% × gross captured",
      inputs: [
        { label: "Gross captured", value: formatPaise(grossCaptured) },
        { label: "Plan rate", value: feeRateBps + " bps, flat, all instruments" },
      ],
      citation: CITATIONS.planFee,
      onMerchantReport: true,
    },
    {
      kind: "refund_principal",
      label: "Refunds issued (principal)",
      amount: -refundPrincipal,
      count: cycle.refunds.length,
      unitAmount: null,
      formula: "sum(refund.amount) over refunds settled in the cycle",
      inputs: [{ label: "Refunds settled", value: fmtCount(cycle.refunds.length) }],
      citation: CITATIONS.refundsApi,
      onMerchantReport: true,
    },
    {
      kind: "tax_on_fees",
      label: "GST at " + gstPercent + "% on the fee",
      amount: -gstOnFees,
      count: null,
      unitAmount: null,
      formula: gstPercent + "% × gateway fee",
      inputs: [
        { label: "Gateway fee", value: formatPaise(gatewayFee) },
        { label: "GST rate", value: gstPercent + "%" },
      ],
      citation: CITATIONS.gst,
      onMerchantReport: true,
    },
    {
      kind: "failed_payment_fee",
      label: "Failed-payment charges",
      amount: -failedFees,
      count: failedCount,
      unitAmount: failedUnit,
      formula:
        fmtCount(failedCount) + " failed attempts × " + formatPaise(failedUnit, { paise: false }),
      inputs: [
        { label: "Failed authorisation attempts", value: fmtCount(failedCount) },
        { label: "Charge per attempt", value: formatPaise(failedUnit) },
      ],
      citation: CITATIONS.failedFee,
      /* A failed attempt never settles, so it can never appear on a settlement
       * report. Chargeable all the same. */
      onMerchantReport: false,
    },
    {
      kind: "chargeback_principal",
      label: "Chargebacks (principal)",
      amount: -chargebackPrincipal,
      count: disputeCount,
      unitAmount: disputeUnitPrincipal,
      formula:
        fmtCount(disputeCount) +
        " disputes × " +
        formatPaise(disputeUnitPrincipal ?? 0, { paise: false }),
      inputs: [{ label: "Disputes raised", value: fmtCount(disputeCount) }],
      citation: CITATIONS.chargebackApi,
      onMerchantReport: true,
    },
    {
      kind: "chargeback_fee",
      label: "Chargeback fees",
      amount: -chargebackFees,
      count: disputeCount,
      unitAmount: chargebackUnitFee,
      formula:
        fmtCount(disputeCount) +
        " disputes × " +
        formatPaise(chargebackUnitFee, { paise: false }),
      inputs: [{ label: "Disputes raised", value: fmtCount(disputeCount) }],
      citation: CITATIONS.chargebackFee,
      onMerchantReport: false,
    },
    {
      kind: "instant_settlement_fee",
      label: "On-demand settlement fee",
      amount: -onDemandTotal,
      count: null,
      unitAmount: null,
      formula: "settlement.fees + settlement.tax, read from the rail's response",
      inputs: [
        {
          label: "Amount settled on demand",
          value: formatPaise(cycle.settlement.onDemandBasePaise),
        },
        { label: "settlement.fees", value: formatPaise(cycle.settlement.feesPaise) },
        { label: "settlement.tax", value: formatPaise(cycle.settlement.taxPaise) },
      ],
      citation: CITATIONS.instantSettlementApi,
      onMerchantReport: false,
    },
  ];

  const specs: LineSpec[] = [
    ...above,
    {
      kind: "net_credited",
      label: "Actually credited",
      /* A marker, not a component of the delta. `seal` leaves this at 0 and
       * puts the sum of everything above into its running balance. */
      amount: 0,
      count: null,
      unitAmount: null,
      formula: "signed sum of every line above",
      inputs: [{ label: "Lines", value: String(above.length) }],
      citation: CITATIONS.derivedNet,
      onMerchantReport: true,
    },
  ];

  const drafts: LineDraft[] = specs.map((s, i) => ({
    id: lineId(i),
    kind: s.kind,
    label: s.label,
    amount: s.amount,
    count: s.count,
    unitAmount: s.unitAmount,
    basis: { formula: s.formula, inputs: [...s.inputs], computedBy: "deterministic" },
    citation: s.citation,
    onMerchantReport: s.onMerchantReport,
    /* Every amount here is checked against the rail's own figures by `seal`,
     * which refuses the whole payload if any of them is out. */
    amountReconciled: true,
    ...verifiability(s.kind, cycle),
  }));

  /* Throws ReconcileError rather than returning a payload with a delta. */
  const lines = seal(drafts, cycle.statedNetPaise);

  const netLine = lines[lines.length - 1];
  if (!netLine) throw new Error("calculate: seal returned no lines");
  const netCredited = netLine.runningBalance;

  /* The contract types this as a literal true, and it is a real invariant —
   * every shipped cycle is constructed and the UI must say so. Narrow rather
   * than cast: a source that ever says otherwise stops here. */
  const constructed = cycle.merchant.constructed;
  if (constructed !== true) {
    throw new Error(
      "Merchant " + cycle.merchant.id + " is not marked constructed. Assay ships no real merchant.",
    );
  }

  return {
    settlementId: cycle.id,
    cycleId: cycle.cycleId,
    cycleLabel: cycle.cycleLabel,
    periodStart: cycle.periodStart,
    periodEnd: cycle.periodEnd,
    settledAt: cycle.settledAt,
    merchant: {
      id: cycle.merchant.id,
      name: cycle.merchant.name,
      segment: cycle.merchant.segment,
      plan: {
        label: cycle.merchant.planLabel,
        headlineBps,
        citation: CITATIONS.planFee,
      },
      constructed,
    },
    grossCaptured,
    netCredited,
    merchantExpected,
    expectationBasis: "gross − " + headlinePercent + "% − refunds",
    unexplainedGap: merchantExpected - netCredited,
    lines,
    instrumentMix: mix,
    reconciliation: {
      ok: true,
      computedNet: netCredited,
      statedNet: cycle.statedNetPaise,
      /* Zero by construction: `seal` threw if it were not. Written as the
       * subtraction rather than as the literal 0 so the field states the
       * identity it is claiming. */
      delta: netCredited - cycle.statedNetPaise,
    },
    policyId: policy.id,
  };
}
