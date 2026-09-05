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
import { computeSettlement } from "./ports.js";
import { COMMITTED_POLICY } from "../domain/committed-policy.js";
import { MEERA_CYCLE, MEERA_SLICES } from "../domain/meera.js";

/**
 * The wave-0 gate: the seam is sound, and the engine is honest about not
 * existing yet.
 *
 * The first group passes today. It proves that `MEERA_CYCLE` — the cycle all
 * three wave-1 streams build against — actually reproduces the canonical
 * figures, so a green calculator later means something. A golden test standing
 * on an unsound fixture proves nothing at all.
 *
 * The last one fails until the calculator stream lands, and that is correct.
 * It is committed failing, wired to `pnpm test:golden`, and kept out of
 * `pnpm test` so CI stays green while wave 1 is in flight.
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

/* --------------------------------- the gate, failing until wave 1 lands */

test("the calculator reproduces the waterfall", () => {
  const s = computeSettlement(MEERA_CYCLE, COMMITTED_POLICY as never);

  assert.equal(s.grossCaptured, GROSS_CAPTURED);
  assert.equal(s.netCredited, NET_CREDITED);
  assert.equal(s.merchantExpected, MERCHANT_EXPECTED);
  assert.equal(s.unexplainedGap, UNEXPLAINED_GAP);
  assert.equal(s.reconciliation.delta, 0);

  const sum = s.lines.filter((l) => l.kind !== "net_credited").reduce((a, l) => a + l.amount, 0);
  assert.equal(sum, NET_CREDITED);

  for (const line of s.lines) {
    assert.ok(line.citation.sourceId.length > 0, "line " + line.id + " cites nothing");
    assert.equal(line.basisVerifiable, line.derivedFromGaps.length === 0, "line " + line.id);
    if (!line.basisVerifiable) assert.ok(line.unverifiableReason, "line " + line.id);
  }
});
