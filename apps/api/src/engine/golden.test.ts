import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHARGEBACK_COUNT,
  CHARGEBACK_FEES,
  CHARGEBACK_PRINCIPAL,
  CHARGEBACK_UNIT_FEE,
  FAILED_COUNT,
  FAILED_FEES,
  FAILED_UNIT,
  GATEWAY_FEE,
  GROSS_CAPTURED,
  GST_ON_FEES,
  HEADLINE_BPS,
  INSTANT_API_FEES,
  INSTANT_API_TAX,
  INSTANT_SETTLEMENT_TOTAL,
  MERCHANT_EXPECTED,
  NET_CREDITED,
  REFUND_PRINCIPAL,
  SETTLEMENT_ID,
  CYCLE_ID,
  UNEXPLAINED_GAP,
  formatPaise,
} from "@assay/contract";
import { computeSettlement } from "./ports.js";
import type { ApprovedFeePolicy } from "../domain/policy.js";
import type { CapturedPayment, RawCycle } from "../domain/raw-cycle.js";
import type { Instrument } from "../domain/instrument.js";

/**
 * The 18:45 gate, made executable.
 *
 * This test FAILS until the calculator stream lands, and that is correct: it
 * is committed failing, wired to `pnpm test:golden`, and kept out of
 * `pnpm test` so CI stays green while wave 1 is in flight.
 *
 * Every canonical figure is imported from the contract's fixtures rather than
 * retyped. If a number here disagrees with the fixture, the fixture wins and
 * this file was wrong — there is exactly one source for these amounts.
 */

/* ------------------------------------------------------- the Meera cycle */

const SETTLED_AT = Date.UTC(2026, 8, 3, 5, 30); // 3 Sep 2026, 11:00 IST
const PERIOD_START = Date.UTC(2026, 7, 1);
const PERIOD_END = Date.UTC(2026, 7, 31, 23, 59, 59);

/** The mix from the fixture, as the payments a source would have produced. */
const MIX: Array<{ instrument: Instrument; reportedAs: string; gross: number; count: number }> = [
  { instrument: "upi_bank_account", reportedAs: "UPI", gross: 72_000_000, count: 640 },
  { instrument: "upi_rupay_credit", reportedAs: "UPI", gross: 12_000_000, count: 85 },
  { instrument: "upi_ppi", reportedAs: "UPI", gross: 6_000_000, count: 55 },
  { instrument: "card_credit", reportedAs: "Card", gross: 24_000_000, count: 145 },
  { instrument: "netbanking", reportedAs: "Netbanking", gross: 6_000_000, count: 35 },
];

/**
 * One payment record per captured payment — 960 of them, matching the
 * fixture's per-slice counts exactly.
 *
 * They are not collapsed into five aggregates on purpose. `paymentCount` in
 * the instrument mix is 640 / 85 / 55 / 145 / 35, and a calculator deriving it
 * from `payments.length` would get 1 per slice from an aggregated cycle and
 * pass a test that was lying to it.
 *
 * The slice gross rarely divides evenly (₹1,20,000 across 85 payments does
 * not), so the remainder lands on the last payment of each slice and every
 * slice still sums to the paisa.
 */
function buildPayments(): CapturedPayment[] {
  const out: CapturedPayment[] = [];
  let n = 0;

  for (const slice of MIX) {
    const each = Math.floor(slice.gross / slice.count);
    const remainder = slice.gross - each * slice.count;

    for (let i = 0; i < slice.count; i += 1) {
      out.push({
        id: "pay_golden_" + n,
        amount: i === slice.count - 1 ? each + remainder : each,
        capturedAt: PERIOD_START + n,
        instrument: slice.instrument,
        reportedAs: slice.reportedAs,
        /* The report states no per-line fee basis. That absence is the third
         * missing field, and it is why these are null rather than zero. */
        feeCharged: null,
        taxOnFee: null,
      });
      n += 1;
    }
  }
  return out;
}

const CYCLE: RawCycle = {
  id: SETTLEMENT_ID,
  cycleId: CYCLE_ID,
  merchant: {
    id: "merchant_meera",
    name: "Meera",
    segment: "D2C skincare",
    planLabel: "Flat 2%",
    headlineBps: HEADLINE_BPS,
    /* §3.7. The arithmetic is real; the merchant is not, and every screen says so. */
    constructed: true,
  },
  label: "August 2026",
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  settledAt: SETTLED_AT,
  statedNet: NET_CREDITED,
  payments: buildPayments(),
  refunds: [
    { id: "rfnd_golden_1", amount: REFUND_PRINCIPAL, paymentId: null, refundedAt: PERIOD_START + 10 },
  ],
  disputes: Array.from({ length: CHARGEBACK_COUNT }, (_, i) => ({
    id: "disp_golden_" + i,
    amountDeducted: CHARGEBACK_PRINCIPAL / CHARGEBACK_COUNT,
    paymentId: null,
    stage: "chargeback",
    raisedAt: PERIOD_START + 20 + i,
  })),
  failedAttemptCount: FAILED_COUNT,
  onDemandSettlements: [
    {
      id: "setlod_golden_1",
      amountRequested: 30_000_000,
      amountSettled: 30_000_000 - INSTANT_SETTLEMENT_TOTAL,
      /* §4.1: read off the rail, never a rate we typed in. */
      fees: INSTANT_API_FEES,
      tax: INSTANT_API_TAX,
      requestedAt: PERIOD_START + 30,
    },
  ],
  /* Three gaps, because the ceiling resolves into exactly three missing
   * fields whose `wouldResolve` must sum to the unverifiable ₹24,000. */
  gaps: [
    {
      id: "gap_instrument_sub_type",
      field: "instrument_sub_type",
      lookedIn: "settlement recon report row (`method` only — reads UPI for all three rails)",
      consequence:
        "The gateway fee cannot be attributed across the three UPI rails, which carry different statutory MDR, so its basis is not checkable from the report.",
      affectedCount: 780,
    },
    {
      id: "gap_card_bin_tier",
      field: "card_bin_tier",
      lookedIn: "settlement recon report row (`card_type` only — no BIN tier)",
      consequence:
        "Debit, credit, commercial and international BINs carry different interchange, and the tier is not on the report.",
      affectedCount: 145,
    },
    {
      id: "gap_per_line_fee_basis",
      field: "per_line_fee_basis",
      lookedIn: "settlement recon report row (states an amount, never the base it was computed on)",
      consequence:
        "An ad-valorem charge and a flat one are indistinguishable on the report, so no line's basis can be recomputed.",
      affectedCount: 35,
    },
  ],
};

/** A policy that has been signed off, so it is allowed to compute a rupee. */
const APPROVED_AT = Date.UTC(2026, 8, 3, 4, 0);
const approval = { status: "approved", approvedBy: "Rafi", approvedAt: APPROVED_AT } as const;

const POLICY: ApprovedFeePolicy = {
  id: "pol_flat2pc01",
  version: "1.0.0",
  label: "Flat 2% plan",
  sourceDocuments: [{ title: "Merchant plan — flat 2%", url: null }],
  status: "approved",
  lines: [
    {
      id: "P-01", rule: "ad_valorem", rateBps: HEADLINE_BPS, base: "gross_captured",
      label: "Gateway fee", appliesTo: "every captured payment",
      quote: "A flat 2% of transaction value.", url: null,
      parsedBy: "model", provenance: "constructed", approval,
    },
    {
      id: "P-02", rule: "tax_on_fees", rateBps: 1800, taxableLineIds: ["P-01"],
      label: "GST on fees", appliesTo: "the sum of fee lines",
      quote: "GST at 18% applies on the fee component.", url: null,
      parsedBy: "model", provenance: "documented", approval,
    },
    {
      id: "P-03", rule: "fixed_per_unit", unitAmount: FAILED_UNIT, countedEvent: "failed_payment_attempt",
      label: "Failed-payment charge", appliesTo: "each failed attempt",
      quote: "₹3 per failed payment attempt.", url: null,
      parsedBy: "model", provenance: "constructed", approval,
    },
    {
      id: "P-04", rule: "fixed_per_unit", unitAmount: CHARGEBACK_UNIT_FEE, countedEvent: "chargeback",
      label: "Chargeback fee", appliesTo: "each chargeback raised",
      quote: "₹500 per chargeback.", url: null,
      parsedBy: "model", provenance: "constructed", approval,
    },
    {
      id: "P-05", rule: "read_from_api", readFromApi: "settlement.fees + settlement.tax",
      label: "On-demand settlement fee", appliesTo: "each on-demand settlement",
      quote: "Read from the settlement response. There is no rate for this in Assay.", url: null,
      parsedBy: "model", provenance: "documented", approval,
    },
    {
      id: "P-06", rule: "zero_mdr_statute", statute: "PSSA §10A",
      label: "Zero network MDR on UPI from a bank account", appliesTo: "the bank-account UPI slice",
      quote: "No merchant discount rate shall be levied on UPI from a bank account.", url: null,
      parsedBy: "model", provenance: "documented", approval,
    },
  ],
};

/* ------------------------------------------------------------------ tests */

const amountOf = (s: ReturnType<typeof computeSettlement>, kind: string): number => {
  const line = s.lines.find((l) => l.kind === kind);
  assert.ok(line, "no line of kind " + kind);
  return line.amount;
};

test("the golden cycle is itself sound before it judges anything", () => {
  const gross = CYCLE.payments.reduce((a, p) => a + p.amount, 0);
  assert.equal(gross, GROSS_CAPTURED, "the constructed cycle does not sum to gross captured");
  assert.equal(CYCLE.payments.length, MIX.reduce((a, m) => a + m.count, 0));

  for (const slice of MIX) {
    const sliceGross = CYCLE.payments
      .filter((p) => p.instrument === slice.instrument)
      .reduce((a, p) => a + p.amount, 0);
    assert.equal(sliceGross, slice.gross, slice.instrument + " slice does not sum");
  }
});

test("§3.4 — the waterfall reproduces to the paisa", () => {
  const s = computeSettlement(CYCLE, POLICY);

  assert.equal(s.grossCaptured, GROSS_CAPTURED);
  assert.equal(s.netCredited, NET_CREDITED);

  assert.equal(amountOf(s, "gateway_fee"), -GATEWAY_FEE);
  assert.equal(amountOf(s, "refund_principal"), -REFUND_PRINCIPAL);
  assert.equal(amountOf(s, "tax_on_fees"), -GST_ON_FEES);
  assert.equal(amountOf(s, "failed_payment_fee"), -FAILED_FEES);
  assert.equal(amountOf(s, "chargeback_principal"), -CHARGEBACK_PRINCIPAL);
  assert.equal(amountOf(s, "chargeback_fee"), -CHARGEBACK_FEES);
  assert.equal(amountOf(s, "instant_settlement_fee"), -INSTANT_SETTLEMENT_TOTAL);

  assert.equal(s.merchantExpected, MERCHANT_EXPECTED);
  assert.equal(s.unexplainedGap, UNEXPLAINED_GAP);
});

test("it reconciles, or it is not returned at all", () => {
  const s = computeSettlement(CYCLE, POLICY);
  assert.equal(s.reconciliation.delta, 0);
  assert.equal(s.reconciliation.ok, true);
  assert.equal(s.reconciliation.statedNet, NET_CREDITED);
});

test("the signed lines sum to net credited", () => {
  const s = computeSettlement(CYCLE, POLICY);
  const sum = s.lines.filter((l) => l.kind !== "net_credited").reduce((a, l) => a + l.amount, 0);
  assert.equal(sum, NET_CREDITED, formatPaise(sum) + " != " + formatPaise(NET_CREDITED));

  const last = s.lines.at(-1);
  assert.equal(last?.kind, "net_credited");
});

test("every line cites the rule that produced it", () => {
  const s = computeSettlement(CYCLE, POLICY);
  for (const line of s.lines) {
    assert.ok(line.citation, "line " + line.id + " has no citation");
    assert.ok(line.citation.sourceId.length > 0, "line " + line.id + " cites an empty sourceId");
  }
});

test("a line that cannot be checked says which field is missing", () => {
  const s = computeSettlement(CYCLE, POLICY);
  for (const line of s.lines) {
    /* The derivation, restated: checkable exactly when it leans on no gap. */
    assert.equal(line.basisVerifiable, line.derivedFromGaps.length === 0, "line " + line.id);
    if (!line.basisVerifiable) {
      assert.ok(line.unverifiableReason, "line " + line.id + " is unverifiable and says nothing");
    }
  }
});

test("the instrument mix accounts for the whole of gross, and of the fee", () => {
  const s = computeSettlement(CYCLE, POLICY);

  const gross = s.instrumentMix.reduce((a, m) => a + m.grossCaptured, 0);
  assert.equal(gross, GROSS_CAPTURED, formatPaise(gross) + " != " + formatPaise(GROSS_CAPTURED));

  const fees = s.instrumentMix.reduce((a, m) => a + m.feeCharged, 0);
  assert.equal(fees, GATEWAY_FEE, formatPaise(fees) + " != " + formatPaise(GATEWAY_FEE));
});

test("the on-demand fee is the rail's own two fields, not a rate", () => {
  const s = computeSettlement(CYCLE, POLICY);
  const line = s.lines.find((l) => l.kind === "instant_settlement_fee");
  assert.ok(line);
  assert.equal(line.amount, -(INSTANT_API_FEES + INSTANT_API_TAX));
  assert.equal(line.citation.kind, "api_field");
});
