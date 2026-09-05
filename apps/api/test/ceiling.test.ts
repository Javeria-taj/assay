import { test } from "node:test";
import assert from "node:assert/strict";
import { Ceiling, rupees, share, type Explanation, type ExplanationLine } from "@assay/contract";
import * as F from "@assay/contract";
import { analyseCeiling } from "../src/engine/ceiling.js";

/* ============================================================================
 * The 19:15 proof.
 *
 * Input is `F.EXPLANATION` and nothing else. Fixture constants appear ONLY as
 * expected values on the right-hand side of an assertion — if a `F.CEILING`
 * field were ever passed INTO `analyseCeiling`, this file would prove nothing.
 *
 * Assertions 1–29 exist to give a gradient. 31 subsumes them, but
 * `CEILING 27/32` at 18:30 tells you where you are and "deepEqual failed"
 * does not. So every assertion is named, recorded, and reported — the run
 * never aborts on the first failure — and the test then fails if fewer than 32
 * passed, so `pnpm test` stays honest.
 * ==========================================================================*/

const TOTAL = 32;

type Outcome = { n: number; name: string; ok: boolean; message: string };
const outcomes: Outcome[] = [];

function assertion(n: number, name: string, fn: () => void): void {
  try {
    fn();
    outcomes.push({ n, name, ok: true, message: "" });
  } catch (e) {
    outcomes.push({ n, name, ok: false, message: e instanceof Error ? e.message : String(e) });
  }
}

let built: Ceiling | null = null;
let buildError = "";
try {
  built = analyseCeiling(F.EXPLANATION);
} catch (e) {
  buildError = e instanceof Error ? e.message : String(e);
}

/** Every assertion goes through here, so a throwing analyser fails all 32 honestly. */
function c(): Ceiling {
  if (!built) throw new Error("analyseCeiling(F.EXPLANATION) threw: " + buildError);
  return built;
}

function fieldNamed(id: string) {
  const m = c().missingFields.find((x) => x.id === id);
  if (!m) throw new Error("no missing field with id " + id);
  return m;
}

/** Assertion 25 compares a ~500-character sentence. Nobody eyeballs that at 19:00. */
function diffStrings(actual: string, expected: string): string {
  const n = Math.min(actual.length, expected.length);
  let i = 0;
  while (i < n && actual[i] === expected[i]) i += 1;
  const window = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 45), i + 45));
  return (
    "note differs at index " +
    i +
    "\n    actual   [" +
    (actual.codePointAt(i) ?? -1) +
    "] " +
    window(actual) +
    "\n    expected [" +
    (expected.codePointAt(i) ?? -1) +
    "] " +
    window(expected)
  );
}

/* ------------------------------------------------------ 1–12 · the buckets */

assertion(1, "totalDelta", () => assert.equal(c().totalDelta, 7108200));
assertion(2, "amountReconciled.amount", () => assert.equal(c().amountReconciled.amount, 7108200));
assertion(3, "amountReconciled.share", () => assert.equal(c().amountReconciled.share, 1));
assertion(4, "amountUnreconciled.amount", () => assert.equal(c().amountUnreconciled.amount, 0));
assertion(5, "amountUnreconciled.share", () => assert.equal(c().amountUnreconciled.share, 0));
assertion(6, "basisVerifiable.amount", () => assert.equal(c().basisVerifiable.amount, 4708200));
assertion(7, "basisVerifiable.share", () => assert.equal(c().basisVerifiable.share, 0.6624));
assertion(8, "basisUnverifiable.amount", () =>
  assert.equal(c().basisUnverifiable.amount, rupees(24_000)),
);
assertion(9, "basisUnverifiable.share", () => assert.equal(c().basisUnverifiable.share, 0.3376));
assertion(10, "basis axis sums to totalDelta", () =>
  assert.equal(c().basisVerifiable.amount + c().basisUnverifiable.amount, c().totalDelta),
);
assertion(11, "reconciled axis sums to totalDelta", () =>
  assert.equal(c().amountReconciled.amount + c().amountUnreconciled.amount, c().totalDelta),
);
assertion(12, "basis shares sum to 1.0000 at 4dp", () =>
  assert.equal(Math.round((c().basisVerifiable.share + c().basisUnverifiable.share) * 10_000), 10_000),
);

/* ------------------------------------------------- 13–20 · missing fields */

assertion(13, "missingFields.length", () => assert.equal(c().missingFields.length, 3));
assertion(14, "emission order is not sorted", () =>
  assert.deepEqual(c().missingFields.map((m) => m.id), [
    "instrument_subtype",
    "card_bin_tier",
    "per_line_fee_basis",
  ]),
);
assertion(15, "the same three ids, sorted", () =>
  assert.deepEqual(
    c()
      .missingFields.map((m) => m.id)
      .sort(),
    ["card_bin_tier", "instrument_subtype", "per_line_fee_basis"],
  ),
);
assertion(16, "instrument_subtype.wouldResolve", () =>
  assert.equal(fieldNamed("instrument_subtype").wouldResolve, rupees(18_000)),
);
assertion(17, "card_bin_tier.wouldResolve", () =>
  assert.equal(fieldNamed("card_bin_tier").wouldResolve, rupees(4_800)),
);
assertion(18, "per_line_fee_basis.wouldResolve", () =>
  assert.equal(fieldNamed("per_line_fee_basis").wouldResolve, rupees(1_200)),
);
assertion(19, "the partition closes invariant 8", () =>
  assert.equal(
    c().missingFields.reduce((a, m) => a + m.wouldResolve, 0),
    c().basisUnverifiable.amount,
  ),
);
assertion(20, "every missing field cites, and cites the right thing", () => {
  const expected: Record<string, F.Citation> = {
    instrument_subtype: F.CITATIONS.upiCollapse,
    card_bin_tier: F.CITATIONS.binTier,
    per_line_fee_basis: F.CITATIONS.feeBasis,
  };
  for (const m of c().missingFields) {
    assert.ok(m.citation.sourceId.length > 0, m.id + " has an empty citation sourceId");
    const want = expected[m.id];
    assert.ok(want, m.id + " is not one of the three known fields");
    assert.deepEqual(m.citation, want, m.id + " cites the wrong source");
  }
});

/* --------------------------------------------------- 21–26 · zero-MDR rails */

assertion(21, "grossOnZeroMdrRails", () =>
  assert.equal(c().zeroMdrExposure.grossOnZeroMdrRails, rupees(7_20_000)),
);
assertion(22, "feeLeviedOnZeroMdrRails", () =>
  assert.equal(c().zeroMdrExposure.feeLeviedOnZeroMdrRails, rupees(14_400)),
);
assertion(23, "annualisedFee", () =>
  assert.equal(c().zeroMdrExposure.annualisedFee, rupees(1_72_800)),
);
assertion(24, "the numeric-filter trap is not sprung", () =>
  assert.notEqual(
    c().zeroMdrExposure.feeLeviedOnZeroMdrRails,
    rupees(15_600),
    "netbanking carries networkMdrBps 0 and is not statutory zero-MDR",
  ),
);
assertion(25, "the note is rendered from a template, byte-identical", () => {
  const actual = c().zeroMdrExposure.note;
  const expected = F.CEILING.zeroMdrExposure.note;
  assert.equal(actual, expected, actual === expected ? "" : diffStrings(actual, expected));
});
assertion(26, "zero-MDR citations, statute then §269SU", () =>
  assert.deepEqual(c().zeroMdrExposure.citations, [F.CITATIONS.zeroMdrStatute, F.CITATIONS.s269su]),
);

/* ------------------------------------------------ 27–31 · copy, id, whole */

assertion(27, "headline is copy.ts's, not retyped", () =>
  assert.equal(c().headline, F.CEILING.headline),
);
assertion(28, "method is CEILING_METHOD", () => assert.equal(c().method, F.CEILING.method));
assertion(29, "settlementId passes through", () =>
  assert.equal(c().settlementId, F.SETTLEMENT_ID),
);
assertion(30, "the result validates against the frozen schema", () => {
  Ceiling.parse(c());
});
assertion(31, "deepEqual against the frozen fixture", () => {
  assert.deepEqual(analyseCeiling(F.EXPLANATION), F.CEILING);
});

/* ---------------------------------------------------------- 32 · the tie */

/**
 * The proof that the complement is DERIVED and not computed twice.
 *
 * `share()` rounds half away from zero. A split landing on a 4dp `.00005`
 * boundary rounds BOTH halves up, and two independent `share()` calls then sum
 * to 1.0001 — outside the frozen `Share` bound and a straight failure of
 * invariant 7. Meera's numbers dodge that boundary; generated cycles will not.
 *
 * 10001p of 20000p is exactly such a boundary: 5000.5 and 4999.5 both round up.
 * The test asserts the trap is real (the naive pair really does sum to 1.0001)
 * and that `analyseCeiling` does not fall into it. The exact-half case is
 * carried alongside as the benign control.
 */
assertion(32, "the tie: shares sum to 1.0000 and never exceed it", () => {
  const lineOfKind = (k: ExplanationLine["kind"]): ExplanationLine => {
    const l = F.EXPLANATION_LINES.find((x) => x.kind === k);
    if (!l) throw new Error("no fixture line of kind " + k);
    return l;
  };

  /* Two deduction lines plus the two markers. Constructed as an INPUT — it is
   * never run through `seal()`, because this is not a settlement. */
  const tieExplanation = (unverifiable: number, verifiable: number): Explanation => {
    let bal = 0;
    const mk = (k: ExplanationLine["kind"], amount: number): ExplanationLine => {
      if (k !== "net_credited") bal += amount;
      return { ...lineOfKind(k), amount, runningBalance: bal };
    };
    const lines = [
      mk("gross_captured", unverifiable + verifiable),
      mk("gateway_fee", -unverifiable),
      mk("refund_principal", -verifiable),
      mk("net_credited", 0),
    ];
    return { ...F.EXPLANATION, grossCaptured: unverifiable + verifiable, netCredited: 0, lines };
  };

  const cases: ReadonlyArray<readonly [string, number, number]> = [
    ["the .00005 boundary", 10001, 9999],
    ["exactly half", 10000, 10000],
  ];

  for (const [label, unverifiable, verifiable] of cases) {
    const tie = analyseCeiling(tieExplanation(unverifiable, verifiable));
    const total = unverifiable + verifiable;
    const paired = tie.basisVerifiable.share + tie.basisUnverifiable.share;

    assert.equal(Math.round(paired * 10_000), 10_000, label + ": shares do not round to 1.0000");
    assert.ok(paired <= 1, label + ": shares sum to " + paired + ", above the Share bound");
    Ceiling.parse(tie);

    if (label === "the .00005 boundary") {
      /* Two independent share() calls on this split really do overshoot — the
       * trap is not hypothetical, and this is the line that proves the fix. */
      assert.equal(
        share(unverifiable, total) + share(verifiable, total),
        1.0001,
        "the boundary case no longer reproduces the two-share() overshoot",
      );
    }
  }
});

/* ------------------------------------------------------------- the counter */

test("ceiling — 32 named assertions against the frozen fixture", () => {
  const passed = outcomes.filter((o) => o.ok).length;
  console.log("CEILING " + passed + "/" + TOTAL);
  for (const o of outcomes) {
    if (!o.ok) console.log("  FAIL " + o.n + " · " + o.name + "\n    " + o.message);
  }
  assert.equal(outcomes.length, TOTAL, "expected " + TOTAL + " named assertions to be registered");
  assert.equal(passed, TOTAL, passed + "/" + TOTAL + " ceiling assertions passed");
});
