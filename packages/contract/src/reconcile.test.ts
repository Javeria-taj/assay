import { test } from "node:test";
import assert from "node:assert/strict";
import { Ceiling, Explanation, Forecast, Policy, SettlementSummary } from "./contract.js";
import { formatPaise, rupees } from "./money.js";
import * as F from "./fixtures.js";

/* The gate. HANDOFF §3.4 reproduced to the rupee, or the build fails. */

test("§3.4 — every figure lands on the rupee", () => {
  assert.equal(F.GROSS_CAPTURED, rupees(12_00_000));
  assert.equal(F.GATEWAY_FEE, rupees(24_000));
  assert.equal(F.REFUND_PRINCIPAL, rupees(32_000));
  assert.equal(F.GST_ON_FEES, rupees(4_320));
  assert.equal(F.FAILED_FEES, rupees(3_300));
  assert.equal(F.CHARGEBACK_PRINCIPAL, rupees(5_400));
  assert.equal(F.CHARGEBACK_FEES, rupees(1_000));
  assert.equal(F.INSTANT_SETTLEMENT_TOTAL, rupees(1_062));
  assert.equal(F.NET_CREDITED, rupees(11_28_918));
  assert.equal(F.MERCHANT_EXPECTED, rupees(11_44_000));
  assert.equal(F.UNEXPLAINED_GAP, rupees(15_082));
  assert.equal(F.TOTAL_DELTA, rupees(71_082));
});

test("the on-demand fee is the rail's own two fields, not a rate we typed in", () => {
  assert.equal(F.INSTANT_API_FEES + F.INSTANT_API_TAX, F.INSTANT_SETTLEMENT_TOTAL);
  assert.equal(F.INSTANT_API_TAX, Math.round(F.INSTANT_API_FEES * 0.18));
  const line = F.EXPLANATION_LINES.find((l) => l.kind === "instant_settlement_fee");
  assert.equal(line?.citation.kind, "api_field");
});

test("the waterfall reconciles: signed lines sum to net credited", () => {
  const sum = F.EXPLANATION_LINES.filter((l) => l.kind !== "net_credited").reduce((a, l) => a + l.amount, 0);
  assert.equal(sum, F.NET_CREDITED, formatPaise(sum) + " != " + formatPaise(F.NET_CREDITED));

  const last = F.EXPLANATION_LINES.at(-1);
  assert.equal(last?.kind, "net_credited");
  assert.equal(last?.runningBalance, F.NET_CREDITED);
  assert.equal(F.EXPLANATION.reconciliation.delta, 0);
  assert.equal(F.EXPLANATION.reconciliation.ok, true);
});

test("running balances are monotonic through the deductions", () => {
  const mid = F.EXPLANATION_LINES.slice(1, -1);
  for (let i = 1; i < mid.length; i++) {
    const prev = mid[i - 1]!;
    const cur = mid[i]!;
    assert.ok(cur.runningBalance <= prev.runningBalance, "line " + cur.id + " increased the balance");
  }
});

test("the instrument mix decomposes gross and fee exactly", () => {
  const gross = F.INSTRUMENT_MIX.reduce((a, s) => a + s.grossCaptured, 0);
  const fees = F.INSTRUMENT_MIX.reduce((a, s) => a + s.feeCharged, 0);
  assert.equal(gross, F.GROSS_CAPTURED);
  assert.equal(fees, F.GATEWAY_FEE);
});

test("₹14,400 of fee sits on a rail carrying zero statutory MDR", () => {
  const zero = F.INSTRUMENT_MIX.filter((s) => s.instrument === "upi_bank_account");
  const fee = zero.reduce((a, s) => a + s.feeCharged, 0);
  assert.equal(fee, rupees(14_400));
  assert.equal(F.CEILING.zeroMdrExposure.feeLeviedOnZeroMdrRails, rupees(14_400));
  assert.equal(F.CEILING.zeroMdrExposure.annualisedFee, rupees(1_72_800));
});

test("the ceiling splits the delta without losing a paisa", () => {
  const c = F.CEILING;
  assert.equal(c.basisVerifiable.amount + c.basisUnverifiable.amount, c.totalDelta);
  assert.equal(c.amountReconciled.amount + c.amountUnreconciled.amount, c.totalDelta);
  assert.equal(Math.round((c.basisVerifiable.share + c.basisUnverifiable.share) * 10_000), 10_000);
  assert.equal(c.basisUnverifiable.amount, rupees(24_000));
  assert.equal(c.basisUnverifiable.share, 0.3376);
});

test("the three missing fields account for the unverifiable amount, without overlap", () => {
  const total = F.CEILING.missingFields.reduce((a, m) => a + m.wouldResolve, 0);
  assert.equal(total, F.CEILING.basisUnverifiable.amount);
  assert.equal(F.CEILING.missingFields.length, 3);
  assert.deepEqual(
    F.CEILING.missingFields.map((m) => m.id).sort(),
    ["card_bin_tier", "instrument_subtype", "per_line_fee_basis"],
  );
});

test("every line carries a citation, and every unverifiable line says why", () => {
  for (const l of F.EXPLANATION_LINES) {
    assert.ok(l.citation.sourceId, l.id + " has no citation");
    if (!l.basisVerifiable) assert.ok(l.unverifiableReason, l.id + " is unverifiable with no reason given");
    else assert.equal(l.unverifiableReason, null);
  }
});

test("every policy line is model-parsed and human-approved before use", () => {
  for (const l of F.POLICY.lines) {
    assert.equal(l.parsedBy, "model");
    assert.equal(l.approved, true, l.id + " was never approved");
    assert.ok(l.approvedBy && l.approvedAt, l.id + " has no approver");
    assert.ok(l.quote.length > 0, l.id + " has no quote");
  }
});

test("the disputed total in the report equals the gap the merchant sees", () => {
  const r = F.buildReport(F.FIXTURE_SETTLED_AT, F.FIXTURE_SETTLED_AT + 3_600_000);
  const claims = r.claims.reduce((a, c) => a + c.amount, 0);
  assert.equal(claims, F.UNEXPLAINED_GAP);
  assert.equal(r.disputedTotal, F.UNEXPLAINED_GAP);
});

test("the 3-day window is computed from the clause, not guessed", () => {
  const settled = F.FIXTURE_SETTLED_AT;
  const w = F.buildWindow(settled, settled + 1_000);
  assert.equal(w.deadlineAt - w.settledAt, 3 * 24 * 60 * 60 * 1000);
  assert.equal(w.status, "open");
  assert.equal(F.buildWindow(settled, settled + 2.5 * 86_400_000).status, "closing");
  assert.equal(F.buildWindow(settled, settled + 4 * 86_400_000).status, "expired");
});

test("the forecast reconciles and refuses to claim untested accuracy", () => {
  const f = F.buildForecast(Date.now());
  const sum = f.projectedLines.filter((l) => l.kind !== "net_credited").reduce((a, l) => a + l.amount, 0);
  assert.equal(sum, f.projectedNet);
  assert.equal(f.backtest.cycles, 0);
});

test("indian money formatting", () => {
  assert.equal(formatPaise(rupees(11_28_918)), "₹11,28,918.00");
  assert.equal(formatPaise(rupees(1_062)), "₹1,062.00");
  assert.equal(formatPaise(-rupees(24_000)), "-₹24,000.00");
  assert.equal(formatPaise(rupees(3), { paise: false }), "₹3");
});

test("every fixture validates against the contract it ships with", () => {
  Explanation.parse(F.EXPLANATION);
  Ceiling.parse(F.CEILING);
  Policy.parse(F.POLICY);
  SettlementSummary.parse(F.SUMMARY);
  Forecast.parse(F.buildForecast(Date.now()));
});
