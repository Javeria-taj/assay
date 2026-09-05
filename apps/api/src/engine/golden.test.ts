import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHARGEBACK_PRINCIPAL,
  CycleId,
  FAILED_COUNT,
  GROSS_CAPTURED,
  INSTANT_API_FEES,
  INSTANT_API_TAX,
  MERCHANT_EXPECTED,
  NET_CREDITED,
  REFUND_PRINCIPAL,
  SettlementId,
  UNEXPLAINED_GAP,
  formatPaise,
} from "@assay/contract";
import { calculate } from "./calculate.js";
import { COMMITTED_POLICY } from "../domain/committed-policy.js";
import { MEERA_CYCLE, MEERA_SLICES } from "../domain/meera.js";

/**
 * The gate: the seam is sound, and the engine reproduces the worked example.
 *
 * The first group proves that `MEERA_CYCLE` — the cycle all three wave-1
 * streams build against — actually reproduces the canonical figures. It runs
 * first for a reason: a golden test standing on an unsound fixture proves
 * nothing at all, so the fixture is checked before it is allowed to judge the
 * engine.
 *
 * The last one is the rupee gate itself.
 *
 * Every canonical figure is imported from the contract's fixtures rather than
 * retyped. If a number here disagrees with the fixture, the fixture wins.
 */

/* ------------------------------------------- the seam, provable right now */

test("the canonical cycle reproduces the worked example, to the paisa", () => {
  const gross = MEERA_CYCLE.payments.reduce((a, p) => a + p.amountPaise, 0);
  assert.equal(gross, GROSS_CAPTURED, formatPaise(gross) + " != " + formatPaise(GROSS_CAPTURED));
  assert.equal(MEERA_CYCLE.payments.length, 960);

  assert.equal(MEERA_CYCLE.refunds.reduce((a, r) => a + r.amountPaise, 0), REFUND_PRINCIPAL);
  assert.equal(MEERA_CYCLE.disputes.reduce((a, d) => a + d.principalPaise, 0), CHARGEBACK_PRINCIPAL);
  assert.equal(MEERA_CYCLE.failedAttempts.length, FAILED_COUNT);
  assert.equal(MEERA_CYCLE.settlement.feesPaise, INSTANT_API_FEES);
  assert.equal(MEERA_CYCLE.settlement.taxPaise, INSTANT_API_TAX);
});

test("statedNetPaise is the rail's own number, and it agrees with the fixture", () => {
  /* Derived in meera.ts from the policy's rules, never from the engine — so
   * `reconciliation.delta === 0` stays an assertion rather than a tautology. */
  assert.equal(MEERA_CYCLE.statedNetPaise, NET_CREDITED);
  assert.equal(MERCHANT_EXPECTED - NET_CREDITED, UNEXPLAINED_GAP);
});

test("the instrument mix carries the collapse the product is about", () => {
  for (const slice of MEERA_SLICES) {
    const rows = MEERA_CYCLE.payments.filter((p) => p.instrument === slice.instrument);
    assert.equal(rows.length, slice.paymentCount, slice.instrument + " count");
    assert.equal(
      rows.reduce((a, p) => a + p.amountPaise, 0),
      slice.grossPaise,
      slice.instrument + " gross",
    );
  }
  /* Three different rails, one word on her report. */
  const upi = MEERA_SLICES.filter((s) => s.reportedAs === "UPI");
  assert.equal(upi.length, 3);
  assert.equal(new Set(upi.map((s) => s.instrument)).size, 3);
});

test("the cycle is internally consistent and contract-shaped", () => {
  assert.ok(CycleId.safeParse(MEERA_CYCLE.cycleId).success, "cycleId must match the frozen regex");
  assert.ok(SettlementId.safeParse(MEERA_CYCLE.settlement.settlementId).success, "settlementId");

  const byId = new Map(MEERA_CYCLE.payments.map((p) => [p.id, p]));
  for (const r of MEERA_CYCLE.refunds) {
    const host = byId.get(r.paymentId);
    assert.ok(host, "refund " + r.id + " has no host payment");
    assert.ok(r.amountPaise <= host.amountPaise, "refund " + r.id + " exceeds its host payment");
  }

  /* One unitAmount on the chargeback line means one principal per cycle. */
  assert.equal(new Set(MEERA_CYCLE.disputes.map((d) => d.principalPaise)).size, 1);

  const ids = [
    ...MEERA_CYCLE.payments,
    ...MEERA_CYCLE.refunds,
    ...MEERA_CYCLE.disputes,
    ...MEERA_CYCLE.failedAttempts,
  ].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "ids collide within the cycle");
});

test("a policy may not compute a rupee until a human has approved every line", () => {
  assert.ok(COMMITTED_POLICY.lines.length > 0);
  for (const line of COMMITTED_POLICY.lines) {
    assert.equal(line.parsedBy, "model", line.id + " must be model-parsed");
    assert.equal(line.approved, true, line.id + " is not approved");
    assert.ok(line.approvedBy, line.id + " has no approver");
    assert.ok((line.approvedAt ?? 0) > 0, line.id + " has no approval timestamp");
  }

  /* The on-demand fee has no rate anywhere in Assay, by construction. */
  const p05 = COMMITTED_POLICY.lines.find((l) => l.id === "P-05");
  assert.ok(p05);
  assert.equal(p05.rateBps, null);
  assert.equal(p05.readFromApi, "settlement.fees + settlement.tax");
});

/* -------------------------------------------------- the gate, now live */

test("the calculator reproduces the waterfall, to the paisa", () => {
  /* Targets `calculate`, not `engine/ports.ts`. The ports stub predates the
   * wave-1 briefs and is superseded by them: it returns the internal
   * `ComputedSettlement` vocabulary, while the engine returns a contract
   * `Explanation`. See docs/workstreams/PATHS.md §3. */
  const e = calculate(MEERA_CYCLE, COMMITTED_POLICY);

  assert.equal(e.grossCaptured, GROSS_CAPTURED);
  assert.equal(e.netCredited, NET_CREDITED);
  assert.equal(e.merchantExpected, MERCHANT_EXPECTED);
  assert.equal(e.unexplainedGap, UNEXPLAINED_GAP);
  assert.equal(e.reconciliation.delta, 0);
  assert.equal(e.reconciliation.ok, true);

  const sum = e.lines.filter((l) => l.kind !== "net_credited").reduce((a, l) => a + l.amount, 0);
  assert.equal(sum, NET_CREDITED, formatPaise(sum) + " != " + formatPaise(NET_CREDITED));

  for (const line of e.lines) {
    assert.ok(line.citation.sourceId.length > 0, "line " + line.id + " cites nothing");
    if (!line.basisVerifiable) assert.ok(line.unverifiableReason, "line " + line.id + " cannot say why");
    else assert.equal(line.unverifiableReason, null, "line " + line.id);
  }
});
