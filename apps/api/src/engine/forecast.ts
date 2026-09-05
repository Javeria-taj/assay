import {
  CITATIONS,
  formatPaise,
  rupees,
  type Citation,
  type ExplanationLine,
  type Forecast,
  type LineKind,
  type Paise,
  type Policy,
} from "@assay/contract";
import type { RawCycle } from "../domain/raw-cycle.js";
import { instrumentMix } from "./instrument-mix.js";
import { applyPolicy, onDemandFee, perEventFee, taxOnFees } from "./policy-apply.js";

/**
 * The open cycle, run forward through the same deterministic engine.
 *
 * "Same engine" is meant literally: every rupee below goes through the same
 * `policy-apply.ts` helpers the settled calculator uses, applied at the same
 * levels of aggregation — P-01 per instrument slice, P-02 once on the summed
 * fee, P-03/P-04 as integer count × approved fixed amount, P-05 read off the
 * rail. Nothing here holds a rate. A forecast computed by a second, friendlier
 * set of rules would be a model with a straight face, and it would diverge from
 * the settlement it is predicting on exactly the cycle that mattered.
 *
 * Three things separate a projection from a settlement, and all three are
 * visible in the payload rather than argued in a comment:
 *   `amountReconciled` is false on every line — nothing has settled, so there
 *   is no rail figure to reconcile against.
 *   `onMerchantReport` is false on every line — the report does not exist yet.
 *   `backtest.cycles` is 0, and MUST render as "accuracy not yet measured".
 *
 * That last one is contract invariant 10. This function runs no backtest, so it
 * claims none. A half-wired replay reporting a fabricated error figure would be
 * strictly worse than the honest zero-cycles answer below.
 *
 * Reference implementation to match: `F.buildForecast(now)` in
 * `packages/contract/src/fixtures.ts`.
 */

const FAILED_ATTEMPT_LINE = "P-03";
const CHARGEBACK_FEE_LINE = "P-04";
const GATEWAY_FEE_LINE = "P-01";
const GST_LINE = "P-02";

const RUPEE_SIGN = "₹";

/** "F-00" … "F-05". Positional over the lines actually emitted. */
const lineId = (i: number): string => "F-" + String(i).padStart(2, "0");

const fmtCount = (n: number): string =>
  formatPaise(rupees(n), { paise: false }).replace(RUPEE_SIGN, "");

/**
 * The note a forecast that has not been measured is required to carry.
 *
 * Held verbatim because it is what the shipped fixture, the mock and the UI
 * already render. The load-bearing half — that no replay has been run here, so
 * the zero error figures mean "unmeasured" and not "perfect" — is a true
 * statement about this function. When a real backtest is wired, this constant
 * and `cycles` change together or not at all.
 */
export const NOT_YET_BACKTESTED_NOTE =
  "Not yet backtested. The synthetic generator (J-B4) has not been run against this policy. The UI must render this as 'accuracy not yet measured' — never as zero error.";

/* ------------------------------------------------------------ verifiability */

/**
 * Which declared source gap each projected line leans on.
 *
 * Derived from `cycle.gaps`, never hand-assigned — the same rule the settled
 * calculator applies, for the same reason: a source that DID return the
 * instrument sub-type must produce a checkable projection, and it only does if
 * the flag is measured rather than typed.
 *
 * This table mirrors `GAP_EXPOSURE` in `calculate.ts`, which does not export
 * it. Escalated rather than worked around: the right fix is one exported rule
 * both files call. Until then the two are pinned together by the fixture — a
 * drift here fails the forecast deep-equal in
 * `apps/api/test/window-report-forecast.test.ts`.
 */
const GAP_EXPOSURE: Readonly<Partial<Record<LineKind, readonly string[]>>> = {
  gateway_fee: ["instrument_sub_type"],
};

/**
 * Forecast-specific copy. The settled cycle's sentence explains the collapse at
 * length; a projected line points at it instead of restating it.
 */
const FORECAST_GAP_REASON: Readonly<Record<string, string>> = {
  instrument_sub_type: "Composition unverifiable, as in the settled cycle.",
};

type Verifiability = Pick<ExplanationLine, "basisVerifiable" | "unverifiableReason">;

function verifiability(kind: LineKind, cycle: RawCycle): Verifiability {
  const exposedTo = GAP_EXPOSURE[kind] ?? [];
  const leanedOn = cycle.gaps.find((gap) => exposedTo.includes(gap.field));
  if (!leanedOn) return { basisVerifiable: true, unverifiableReason: null };
  return {
    basisVerifiable: false,
    unverifiableReason: FORECAST_GAP_REASON[leanedOn.field] ?? leanedOn.consequence,
  };
}

/* -------------------------------------------------------------- the engine */

type ProjectedSpec = {
  kind: LineKind;
  label: string;
  amount: Paise;
  formula: string;
  citation: Citation;
};

export function forecastOpenCycle(cycle: RawCycle, policy: Policy, asOf: number): Forecast {
  /* Before a single rupee: every rule carries a human's approval. A projection
   * computed from an unapproved rate is not a smaller problem than a
   * settlement computed from one. */
  const p = applyPolicy(policy);

  const capturedSoFar = cycle.payments.reduce((a, payment) => a + payment.amountPaise, 0);

  /* DEFINED as the sum of the slices, exactly as in `calculate.ts`. Not one
   * bps() call on the aggregate: `Σ bps(x_i, r)` is not `bps(Σ x_i, r)`, and a
   * projection that rounds differently from the settlement it predicts would
   * show a gap that only the rounding created. */
  const gatewayFee = instrumentMix(cycle, p).reduce((a, slice) => a + slice.feeCharged, 0);

  const refundPrincipal = cycle.refunds.reduce((a, refund) => a + refund.amountPaise, 0);
  const gstOnFees = taxOnFees(gatewayFee, p);

  const failedCount = cycle.failedAttempts.length;
  const failedFees = perEventFee(failedCount, FAILED_ATTEMPT_LINE, p);

  const disputeCount = cycle.disputes.length;
  const chargebackPrincipal = cycle.disputes.reduce((a, d) => a + d.principalPaise, 0);
  const chargebackFees = perEventFee(disputeCount, CHARGEBACK_FEE_LINE, p);

  /* Read, never computed — and the read validates P-05 even when the cycle has
   * not settled on demand, so a policy that grew a rate for this line is
   * refused here too. */
  const onDemandTotal = onDemandFee(cycle.settlement, p);

  /* Derived, never typed: "2", "2.00", "18". */
  const feeRateBps = p.rate(GATEWAY_FEE_LINE);
  const feePercent = String(feeRateBps / 100);
  const feePercent2dp = (feeRateBps / 100).toFixed(2);
  const gstPercent = String(p.rate(GST_LINE) / 100);
  const failedUnit = p.fixed(FAILED_ATTEMPT_LINE);
  const chargebackUnitFee = p.fixed(CHARGEBACK_FEE_LINE);

  /**
   * A component line is emitted only when the cycle has actually incurred it.
   * A projection listing "Chargebacks ₹0" against a cycle with no disputes
   * would be forecasting an event that has not happened; the merchant reads the
   * absence correctly and reads the zero as a prediction.
   */
  const components: ProjectedSpec[] = [
    {
      kind: "gross_captured",
      label: "Captured so far",
      amount: capturedSoFar,
      formula: "sum(payment.amount), cycle to date",
      citation: CITATIONS.capturedApi,
    },
    {
      kind: "gateway_fee",
      label: "Gateway fee at " + feePercent + "%",
      amount: -gatewayFee,
      formula: feePercent2dp + "% × captured to date",
      citation: CITATIONS.planFee,
    },
    {
      kind: "refund_principal",
      label: "Refunds issued",
      amount: -refundPrincipal,
      formula: "sum(refund.amount), cycle to date",
      citation: CITATIONS.refundsApi,
    },
    {
      kind: "tax_on_fees",
      label: "GST at " + gstPercent + "% on the fee",
      amount: -gstOnFees,
      formula: gstPercent + "% × gateway fee",
      citation: CITATIONS.gst,
    },
    {
      kind: "failed_payment_fee",
      label: "Failed-payment charges",
      amount: -failedFees,
      formula:
        fmtCount(failedCount) +
        " failed attempts × " +
        formatPaise(failedUnit, { paise: false }),
      citation: CITATIONS.failedFee,
    },
    {
      kind: "chargeback_principal",
      label: "Chargebacks (principal)",
      amount: -chargebackPrincipal,
      /* Counted, not multiplied out: a cycle still open may yet raise a dispute
       * carrying a different principal, and this line holds no unitAmount to
       * hang an average on. */
      formula: "sum(dispute.amount) over " + fmtCount(disputeCount) + " disputes, cycle to date",
      citation: CITATIONS.chargebackApi,
    },
    {
      kind: "chargeback_fee",
      label: "Chargeback fees",
      amount: -chargebackFees,
      formula:
        fmtCount(disputeCount) +
        " disputes × " +
        formatPaise(chargebackUnitFee, { paise: false }),
      citation: CITATIONS.chargebackFee,
    },
    {
      kind: "instant_settlement_fee",
      label: "On-demand settlement fee",
      amount: -onDemandTotal,
      formula: "settlement.fees + settlement.tax, read from the rail's response",
      citation: CITATIONS.instantSettlementApi,
    },
  ];

  const emitted = components.filter((c) => c.kind === "gross_captured" || c.amount !== 0);

  let balance = 0;
  const projectedLines: ExplanationLine[] = emitted.map((c, i) => {
    balance += c.amount;
    return {
      id: lineId(i),
      kind: c.kind,
      label: c.label,
      amount: c.amount,
      runningBalance: balance,
      /* A projection carries no per-event breakdown: the count is still moving.
       * The formula says what has happened so far; `count` would read as final. */
      count: null,
      unitAmount: null,
      basis: { formula: c.formula, inputs: [], computedBy: "deterministic" },
      citation: c.citation,
      /* Nothing has settled: there is no report to appear on, and no rail
       * figure to reconcile against. Both false, and both are facts about a
       * cycle that is still open rather than judgements about the numbers. */
      onMerchantReport: false,
      amountReconciled: false,
      ...verifiability(c.kind, cycle),
    };
  });

  const projectedNet = balance;

  projectedLines.push({
    id: lineId(projectedLines.length),
    kind: "net_credited",
    label: "Projected credit",
    /* A marker, not a component. The sum lives in the running balance. */
    amount: 0,
    runningBalance: projectedNet,
    count: null,
    unitAmount: null,
    basis: { formula: "signed sum of every line above", inputs: [], computedBy: "deterministic" },
    citation: CITATIONS.derivedNet,
    onMerchantReport: false,
    amountReconciled: false,
    ...verifiability("net_credited", cycle),
  });

  return {
    cycleId: cycle.cycleId,
    asOf,
    /* When the open cycle is expected to land, as the source declared it. */
    expectedSettlementAt: cycle.settledAt,
    capturedSoFar,
    projectedNet,
    projectedLines,
    backtest: {
      method: "policy_engine_replay",
      /* Zero, because this function replays nothing. See the note. */
      cycles: 0,
      medianAbsError: 0,
      maxAbsError: 0,
      note: NOT_YET_BACKTESTED_NOTE,
    },
  };
}
