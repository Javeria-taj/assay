import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  CITATIONS,
  Explanation,
  bps,
  rupees,
  type Explanation as ExplanationType,
  type ExplanationLine,
} from "@assay/contract";
import * as F from "@assay/contract";
import { COMMITTED_POLICY } from "../src/domain/committed-policy.js";
import { MEERA_CYCLE } from "../src/domain/meera.js";
import { ReconcileError } from "../src/domain/lines.js";
import { calculate } from "../src/engine/calculate.js";
import { instrumentMix } from "../src/engine/instrument-mix.js";
import { PolicyNotApprovedError, applyPolicy } from "../src/engine/policy-apply.js";
import { checkWaterfall } from "../../../tools/invariants/waterfall.js";

/**
 * The rupee gate.
 *
 * The inputs are MEERA_CYCLE and COMMITTED_POLICY, always. Everything imported
 * from `@assay/contract` here appears on the RIGHT of an assertion and never on
 * the left — a fixture used as an input proves nothing about the engine.
 */

/* ------------------------------------------------------------ the counter */

const TOTAL = 34;
let registered = 0;
let passed = 0;

function tier1(label: string, fn: () => void) {
  registered++;
  try {
    fn();
    passed++;
  } catch (e) {
    console.log(`TIER-1 FAIL · ${label} · ${(e as Error).message}`);
  }
}

/**
 * Lazy and memoised. If `calculate` throws, each tier-1 check fails inside its
 * own try and the counter still reads an honest number, instead of the module
 * dying at import time and reporting nothing at all.
 */
let cached: ExplanationType | null = null;
function e(): ExplanationType {
  if (cached === null) cached = calculate(MEERA_CYCLE, COMMITTED_POLICY);
  return cached;
}

function lineAt(i: number): ExplanationLine {
  const l = e().lines[i];
  if (!l) throw new Error("no line at index " + i);
  return l;
}

function amountOf(kind: ExplanationLine["kind"]): number {
  const l = e().lines.find((x) => x.kind === kind);
  if (!l) throw new Error("no " + kind + " line");
  return Math.abs(l.amount);
}

/* ------------------------------------------------ 1–12 · the twelve figures */

tier1("1 · gross captured", () => assert.equal(e().grossCaptured, F.GROSS_CAPTURED));
tier1("2 · gateway fee", () => assert.equal(amountOf("gateway_fee"), F.GATEWAY_FEE));
tier1("3 · refund principal", () => assert.equal(amountOf("refund_principal"), F.REFUND_PRINCIPAL));
tier1("4 · GST on fees", () => assert.equal(amountOf("tax_on_fees"), F.GST_ON_FEES));
tier1("5 · failed-payment fees", () => assert.equal(amountOf("failed_payment_fee"), F.FAILED_FEES));
tier1("6 · chargeback principal", () =>
  assert.equal(amountOf("chargeback_principal"), F.CHARGEBACK_PRINCIPAL));
tier1("7 · chargeback fees", () => assert.equal(amountOf("chargeback_fee"), F.CHARGEBACK_FEES));
tier1("8 · on-demand settlement total", () =>
  assert.equal(amountOf("instant_settlement_fee"), F.INSTANT_SETTLEMENT_TOTAL));
tier1("9 · net credited", () => {
  assert.equal(e().netCredited, F.NET_CREDITED);
  assert.equal(e().netCredited, rupees(11_28_918));
});
tier1("10 · merchant expected", () => assert.equal(e().merchantExpected, F.MERCHANT_EXPECTED));
tier1("11 · unexplained gap", () => {
  assert.equal(e().unexplainedGap, F.UNEXPLAINED_GAP);
  assert.equal(e().unexplainedGap, rupees(15_082));
});
tier1("12 · total delta", () => {
  assert.equal(e().grossCaptured - e().netCredited, F.TOTAL_DELTA);
  assert.equal(e().grossCaptured - e().netCredited, rupees(71_082));
});

/* ------------------------------------------------ 13–21 · the nine line ids */

const EXPECTED_LINES: ReadonlyArray<readonly [string, ExplanationLine["kind"]]> = [
  ["L-00", "gross_captured"],
  ["L-01", "gateway_fee"],
  ["L-02", "refund_principal"],
  ["L-03", "tax_on_fees"],
  ["L-04", "failed_payment_fee"],
  ["L-05", "chargeback_principal"],
  ["L-06", "chargeback_fee"],
  ["L-07", "instant_settlement_fee"],
  ["L-08", "net_credited"],
];

for (const [i, spec] of EXPECTED_LINES.entries()) {
  const [id, kind] = spec;
  tier1(`${13 + i} · line ${i} is ${id} / ${kind}`, () => {
    const l = lineAt(i);
    assert.equal(l.id, id);
    assert.equal(l.kind, kind);
  });
}

/* --------------------------------- 22–27 · count and unitAmount, per-event */

tier1("22 · L-04 count", () => assert.equal(lineAt(4).count, F.FAILED_COUNT));
tier1("23 · L-04 unitAmount", () => assert.equal(lineAt(4).unitAmount, F.FAILED_UNIT));
tier1("24 · L-05 count", () => assert.equal(lineAt(5).count, F.CHARGEBACK_COUNT));
tier1("25 · L-05 unitAmount", () =>
  assert.equal(lineAt(5).unitAmount, F.CHARGEBACK_UNIT_PRINCIPAL));
tier1("26 · L-06 count", () => assert.equal(lineAt(6).count, F.CHARGEBACK_COUNT));
tier1("27 · L-06 unitAmount", () => assert.equal(lineAt(6).unitAmount, F.CHARGEBACK_UNIT_FEE));

/* ------------------------------------------- 28–32 · the five mix slices */

for (const [i, expected] of F.INSTRUMENT_MIX.entries()) {
  tier1(`${28 + i} · slice ${i} · ${expected.instrument}`, () => {
    const got = e().instrumentMix[i];
    assert.ok(got, "no slice at index " + i);
    assert.equal(got.instrument, expected.instrument);
    assert.equal(got.grossCaptured, expected.grossCaptured);
    assert.equal(got.feeCharged, expected.feeCharged);
  });
}

/* --------------------------------------- 33 · the waterfall closes exactly */

tier1("33 · reconciliation.delta is zero", () => {
  assert.equal(e().reconciliation.delta, 0);
  assert.equal(e().reconciliation.ok, true);
});

/* ------------------------------------------------- 34 · the perturbation */

tier1("34 · a stated net one paisa out is a refusal, not a delta", () => {
  assert.throws(
    () =>
      calculate(
        { ...MEERA_CYCLE, statedNetPaise: MEERA_CYCLE.statedNetPaise + 1 },
        COMMITTED_POLICY,
      ),
    ReconcileError,
  );
});

after(() => console.log(`TIER-1 ${passed}/${TOTAL}`));

test("tier-1 gate", () => {
  assert.equal(registered, TOTAL, "assertion count drifted — do not delete a tier-1 check");
  assert.equal(passed, TOTAL);
});

/* ==========================================================================
 * Tier 2 — outside the counter. These may fail at the 18:45 read without
 * moving the number, and must all pass by 20:15.
 * ========================================================================*/

test("tier-2 · the waterfall invariants W1–W5 all hold", () => {
  assert.deepEqual(checkWaterfall(calculate(MEERA_CYCLE, COMMITTED_POLICY)), []);
});

test("tier-2 · the payload validates against the frozen Zod schema", () => {
  const parsed = Explanation.safeParse(calculate(MEERA_CYCLE, COMMITTED_POLICY));
  assert.ok(
    parsed.success,
    parsed.success ? "" : parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("\n"),
  );
});

test("tier-2 · an unapproved policy line refuses before a rupee is computed", () => {
  const [first, ...rest] = COMMITTED_POLICY.lines;
  assert.ok(first);
  const unapproved = { ...COMMITTED_POLICY, lines: [{ ...first, approved: false }, ...rest] };

  /* Raised by applyPolicy itself — the first thing calculate does — so no
   * arithmetic has run by the time it throws. */
  assert.throws(() => applyPolicy(unapproved), PolicyNotApprovedError);
  assert.throws(() => calculate(MEERA_CYCLE, unapproved), PolicyNotApprovedError);
  try {
    applyPolicy(unapproved);
    assert.fail("expected PolicyNotApprovedError");
  } catch (err) {
    assert.ok(err instanceof PolicyNotApprovedError);
    assert.equal(err.lineId, first.id);
    assert.equal(err.code, "policy_not_approved");
  }
});

test("tier-2 · collapsedInReport is about the label, not about who else showed up", () => {
  const mix = instrumentMix(MEERA_CYCLE, applyPolicy(COMMITTED_POLICY));
  const card = mix.find((s) => s.instrument === "card_credit");
  const netbanking = mix.find((s) => s.instrument === "netbanking");

  /* card_credit is the ONLY Card slice tonight and is still collapsed: the
   * BIN tier it hides exists in the world whether or not card_debit turned up. */
  assert.equal(card?.collapsedInReport, true);
  assert.equal(netbanking?.collapsedInReport, false);
});

test("tier-2 · Σ slice.feeCharged equals bps(gross, plan rate) — asserted, never assumed", () => {
  const mix = instrumentMix(MEERA_CYCLE, applyPolicy(COMMITTED_POLICY));
  const summed = mix.reduce((a, s) => a + s.feeCharged, 0);

  /* The cycle fee is DEFINED as this sum. That it also equals one bps() call on
   * the aggregate is a fact about tonight's mix, checked here so the day it
   * stops being true we find out from a test rather than from a merchant. */
  assert.equal(summed, bps(F.GROSS_CAPTURED, F.HEADLINE_BPS));
  assert.equal(summed, F.GATEWAY_FEE);
});

test("tier-2 · every citation is reference-identical to a CITATIONS member", () => {
  const known = Object.values(CITATIONS);
  const out = calculate(MEERA_CYCLE, COMMITTED_POLICY);
  for (const l of out.lines) {
    assert.ok(known.includes(l.citation), "line " + l.id + " reconstructed its citation");
  }
  for (const s of out.instrumentMix) {
    assert.ok(known.includes(s.citation), "slice " + s.instrument + " reconstructed its citation");
  }
  assert.ok(known.includes(out.merchant.plan.citation), "merchant plan reconstructed its citation");
});

test("tier-2 · calculate is pure: same inputs, deeply equal outputs", () => {
  assert.deepEqual(
    calculate(MEERA_CYCLE, COMMITTED_POLICY),
    calculate(MEERA_CYCLE, COMMITTED_POLICY),
  );
});

test("tier-2 · THE 20:15 TARGET — deepEqual against the frozen fixture", () => {
  assert.deepEqual(calculate(MEERA_CYCLE, COMMITTED_POLICY), F.EXPLANATION);
});
