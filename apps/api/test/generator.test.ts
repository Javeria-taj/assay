import assert from "node:assert/strict";
import test from "node:test";

import { CycleId, Explanation, SettlementId } from "@assay/contract";
import { COMMITTED_POLICY } from "../src/domain/committed-policy.js";
import { MEERA_CYCLE } from "../src/domain/meera.js";
import type { RawCycle } from "../src/domain/raw-cycle.js";
import { calculate } from "../src/engine/calculate.js";
import {
  CANONICAL_SEED,
  HISTORICAL_SEEDS,
  SEEDS,
  checkCycle,
  generate,
  historicalCycles,
  specFor,
  statedNetOf,
  syntheticSource,
} from "../src/sources/synthetic.js";
import { checkWaterfall } from "../../../tools/invariants/waterfall.js";

/**
 * The generator's own suite.
 *
 * Only the canonical seed has authored expected numbers. The other five are
 * checked entirely by `checkCycle` and by the engine's own reconciliation —
 * nobody hand-types five expected outputs, which is the point of the structural
 * invariants existing at all.
 */

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const grossOf = (c: RawCycle): number => sum(c.payments.map((p) => p.amountPaise));

const sliceOf = (c: RawCycle, instrument: string): { gross: number; count: number } => {
  const ps = c.payments.filter((p) => p.instrument === instrument);
  return { gross: sum(ps.map((p) => p.amountPaise)), count: ps.length };
};

/**
 * One draw of the whole corpus, shared by the tests that only READ it.
 * The determinism test below deliberately draws its own, twice.
 */
const CORPUS: readonly RawCycle[] = SEEDS.map((s) => generate(s));

/* ---------------------------------------------------------------- test 1 -- */

test("the canonical seed reproduces Meera's cycle on every aggregate", () => {
  const g = generate(CANONICAL_SEED);

  assert.equal(g.cycleId, MEERA_CYCLE.cycleId);
  assert.equal(g.id, MEERA_CYCLE.id);
  assert.equal(g.cycleLabel, MEERA_CYCLE.cycleLabel);
  assert.equal(g.periodStart, MEERA_CYCLE.periodStart);
  assert.equal(g.periodEnd, MEERA_CYCLE.periodEnd);
  assert.equal(g.settledAt, MEERA_CYCLE.settledAt);
  assert.equal(g.status, "settled");
  assert.deepEqual(g.merchant, MEERA_CYCLE.merchant);

  assert.equal(g.payments.length, 960);
  assert.equal(grossOf(g), 120_000_000);

  assert.deepEqual(sliceOf(g, "upi_bank_account"), { gross: 72_000_000, count: 640 });
  assert.deepEqual(sliceOf(g, "upi_rupay_credit"), { gross: 12_000_000, count: 85 });
  assert.deepEqual(sliceOf(g, "upi_ppi"), { gross: 6_000_000, count: 55 });
  assert.deepEqual(sliceOf(g, "card_credit"), { gross: 24_000_000, count: 145 });
  assert.deepEqual(sliceOf(g, "netbanking"), { gross: 6_000_000, count: 35 });

  assert.equal(g.refunds.length, 41);
  assert.equal(sum(g.refunds.map((r) => r.amountPaise)), 3_200_000);

  assert.equal(g.disputes.length, 2);
  for (const d of g.disputes) assert.equal(d.principalPaise, 270_000);

  assert.equal(g.failedAttempts.length, 1_100);

  assert.equal(g.settlement.settlementId, MEERA_CYCLE.settlement.settlementId);
  assert.equal(g.settlement.settledAt, MEERA_CYCLE.settlement.settledAt);
  assert.equal(g.settlement.onDemandBasePaise, 30_000_000);
  assert.equal(g.settlement.feesPaise, 90_000);
  assert.equal(g.settlement.taxPaise, 16_200);

  assert.equal(g.statedNetPaise, 112_891_800);
  assert.equal(g.statedNetPaise, MEERA_CYCLE.statedNetPaise);
});

test("the canonical cycle is NOT the hand-written one, and must never be asserted to be", () => {
  const g = generate(CANONICAL_SEED);
  /* MEERA_CYCLE calls partition without an rng, so its individual tickets, ids
   * and timestamps differ from a seeded draw. Only the aggregates above agree.
   * Forcing a deep-equal here would mean reverse-engineering partition's
   * no-rng output, which tests nothing. */
  assert.notDeepEqual(g, MEERA_CYCLE);
  assert.notDeepEqual(
    g.payments.map((p) => p.amountPaise),
    MEERA_CYCLE.payments.map((p) => p.amountPaise),
  );
});

test("statedNetOf walks the policy's own rates to the rail's ₹11,28,918", () => {
  assert.equal(statedNetOf(specFor(CANONICAL_SEED), COMMITTED_POLICY), 112_891_800);
});

test("statedNetOf refuses a policy whose lines are not approved", () => {
  const unapproved = {
    ...COMMITTED_POLICY,
    lines: COMMITTED_POLICY.lines.map((l) => ({ ...l, approved: false })),
  };
  assert.throws(() => statedNetOf(specFor(CANONICAL_SEED), unapproved), /not approved/);
});

/* ---------------------------------------------------------------- test 2 -- */

test("every seed is deterministic, and different seeds are different arithmetic", () => {
  for (const seed of SEEDS) {
    assert.deepStrictEqual(generate(seed), generate(seed), "seed " + seed + " did not reproduce");
  }

  const first = SEEDS[0];
  const second = SEEDS[1];
  assert.ok(first !== undefined && second !== undefined);
  const a = generate(first);
  const b = generate(second);
  assert.notEqual(grossOf(a), grossOf(b));
  assert.notEqual(a.payments.length, b.payments.length);
  assert.notEqual(a.statedNetPaise, b.statedNetPaise);
});

/* ---------------------------------------------------------------- test 3 -- */

test("every seed satisfies the structural invariants, with no authored expected output", () => {
  for (const c of CORPUS) {
    assert.deepEqual(checkCycle(c), [], "seed " + c.cycleLabel);
  }
});

/* ---------------------------------------------------------------- test 4 -- */

test("every seed's ids satisfy the frozen schemas, and there are six seeds", () => {
  assert.equal(SEEDS.length, 6);
  assert.equal(HISTORICAL_SEEDS.length, 5);
  for (const c of CORPUS) {
    CycleId.parse(c.cycleId);
    SettlementId.parse(c.settlement.settlementId);
    SettlementId.parse(c.id);
  }
});

test("a seed the month cannot be read from is refused, not guessed at", () => {
  assert.throws(() => specFor("not-a-cycle"), /YYYY-MM/);
  assert.throws(() => specFor("meera-2026-13"), /not 1–12/);
});

/* ---------------------------------------------------------------- test 5 -- */

test("the corpus covers a wallet rail and a cycle carrying both card sub-types", () => {
  const rails = (c: RawCycle): Set<string> => new Set(c.payments.map((p) => p.instrument));

  assert.ok(
    CORPUS.some((c) => rails(c).has("wallet")),
    "no seed carries a wallet slice — attributionOf's else branch is never exercised",
  );
  assert.ok(
    CORPUS.some((c) => rails(c).has("card_debit") && rails(c).has("card_credit")),
    "no seed carries both card sub-types — no cycle has two slices sharing one reportedAs",
  );
});

/* ---------------------------------------------------------------- test 6 -- */

test("the generated canonical cycle is a drop-in replacement at the engine boundary", () => {
  assert.deepEqual(
    calculate(generate(CANONICAL_SEED), COMMITTED_POLICY),
    calculate(MEERA_CYCLE, COMMITTED_POLICY),
  );
});

/* ---------------------------------------------------------------- test 7 -- */

test("every seed survives the engine: contract-valid, reconciled, waterfall clean", () => {
  for (const c of CORPUS) {
    const e = calculate(c, COMMITTED_POLICY);
    Explanation.parse(e);
    assert.equal(e.reconciliation.delta, 0, e.cycleLabel + " left a delta");
    assert.equal(e.reconciliation.ok, true, e.cycleLabel);
    assert.deepEqual(checkWaterfall(e), [], e.cycleLabel);
  }
});

/* --------------------------------------------------------- the source seam - */

test("syntheticSource satisfies the seam's SettlementSource, unmodified", async () => {
  const source = syntheticSource();
  assert.equal(source.kind, "synthetic");

  const refs = await source.listCycles();
  assert.equal(refs.length, 6);
  assert.equal(refs[0]?.cycleId, "cyc_202608");

  const canonical = await source.getCycle("cyc_202608");
  assert.ok(canonical);
  assert.equal(canonical.statedNetPaise, 112_891_800);

  assert.equal(await source.getCycle("cyc_nope99"), null);
});

test("historicalCycles hands the backtest five sealed prior cycles, newest first", () => {
  const cycles = historicalCycles();
  assert.equal(cycles.length, 5);
  for (const c of cycles) {
    assert.equal(c.status, "settled");
    assert.ok(c.statedNetPaise > 0);
  }
  for (let i = 1; i < cycles.length; i += 1) {
    const newer = cycles[i - 1];
    const older = cycles[i];
    assert.ok(newer && older);
    assert.ok(newer.periodStart > older.periodStart, "cycles are not newest-first");
  }
});
