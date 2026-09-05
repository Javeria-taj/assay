import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CITATIONS,
  CLOSING_THRESHOLD_MS,
  DISPUTE_WINDOW_MS,
  DiscrepancyReport,
  DisputeWindow,
  Forecast,
  bps,
  buildPath,
  formatPaise,
  rupees,
  type Explanation,
  type Instrument,
  type Paise,
} from "@assay/contract";
import * as F from "../../../packages/contract/src/fixtures.js";
import { COMMITTED_POLICY } from "../src/domain/committed-policy.js";
import { MEERA_CYCLE } from "../src/domain/meera.js";
import type {
  RawCycle,
  RawFailedAttempt,
  RawPayment,
  RawRefund,
  SourceGap,
} from "../src/domain/raw-cycle.js";
import { calculate } from "../src/engine/calculate.js";
import { buildDisputeWindow, windowStatus } from "../src/engine/window.js";
import { buildReport } from "../src/engine/report.js";
import { forecastOpenCycle } from "../src/engine/forecast.js";
import type { InvariantContext } from "../../../tools/invariants/index.js";
import { reportCheck } from "../../../tools/invariants/report.js";

/**
 * WS-4 — the dispute window, the discrepancy report and the forecast.
 *
 * The gate is deep equality against the SHIPPED payloads, twice over:
 *
 *   1. against `packages/contract/src/fixtures.ts`, the typed reference; and
 *   2. against `tools/fixtures.generated.json`, which is what the mock server
 *      actually serves and therefore what the UI is built against.
 *
 * Two targets rather than one because they can disagree: the JSON is generated
 * and committed, so a fixture edit that was never regenerated shows up here as
 * a failure instead of at the demo. Neither is retyped in this file — every
 * expected value is imported or read.
 *
 * The report is then rebuilt a second time from `calculate()`'s own output,
 * which is the assertion that matters most: it proves the letter is assembled
 * from the engine's reconciled lines and not from the fixture it happens to
 * match.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED = JSON.parse(
  readFileSync(join(HERE, "..", "..", "..", "tools", "fixtures.generated.json"), "utf8"),
) as {
  anchorNow: number;
  window: unknown;
  report: unknown;
  forecast: unknown;
};

/** The "closing" state the fixtures are anchored at: 54 hours after settlement. */
const ANCHOR_NOW = F.FIXTURE_SETTLED_AT + 54 * 60 * 60 * 1000;

const T = (iso: string) => Date.parse(iso);

/* ============================================================== the window */

test("the dispute window reproduces the shipped payload, to the millisecond", () => {
  const built = buildDisputeWindow(F.FIXTURE_SETTLED_AT, ANCHOR_NOW, F.SETTLEMENT_ID);

  assert.equal(GENERATED.anchorNow, ANCHOR_NOW, "the generated JSON is anchored elsewhere");
  assert.deepEqual(built, F.buildWindow(F.FIXTURE_SETTLED_AT, ANCHOR_NOW));
  assert.deepEqual(built, DisputeWindow.parse(GENERATED.window));

  /* The three the UI renders directly. Stated again so a failure names the
   * field rather than dumping two objects. */
  assert.equal(built.deadlineAt, F.FIXTURE_SETTLED_AT + DISPUTE_WINDOW_MS);
  assert.equal(built.msRemaining, built.deadlineAt - built.serverNow);
  assert.equal(built.status, "closing");
});

test("the clause is the contract's own citation object, never a retyped copy", () => {
  const built = buildDisputeWindow(F.FIXTURE_SETTLED_AT, ANCHOR_NOW, F.SETTLEMENT_ID);
  /* Reference equality on purpose: a reconstructed citation deep-equals until
   * somebody fixes a typo in one of the two copies. */
  assert.equal(built.clause, CITATIONS.threeDayClause);
});

test("the status flips AT the boundary, not after it", () => {
  const settledAt = F.FIXTURE_SETTLED_AT;
  const deadline = settledAt + DISPUTE_WINDOW_MS;
  const at = (now: number) => buildDisputeWindow(settledAt, now, F.SETTLEMENT_ID).status;

  assert.equal(at(settledAt), "open");
  assert.equal(at(deadline - CLOSING_THRESHOLD_MS - 1), "open");
  /* Exactly one day left already reads "closing". */
  assert.equal(at(deadline - CLOSING_THRESHOLD_MS), "closing");
  assert.equal(at(deadline - 1), "closing");
  /* Exactly on the deadline the right has lapsed. "open" here would be a lie
   * with a contractual consequence. */
  assert.equal(at(deadline), "expired");
  assert.equal(at(deadline + 1), "expired");

  assert.equal(windowStatus(0), "expired");
  assert.equal(windowStatus(CLOSING_THRESHOLD_MS), "closing");
  assert.equal(windowStatus(CLOSING_THRESHOLD_MS + 1), "open");
});

/* ============================================================== the report */

const CANONICAL_WINDOW = buildDisputeWindow(F.FIXTURE_SETTLED_AT, ANCHOR_NOW, F.SETTLEMENT_ID);

test("the discrepancy report reproduces the shipped payload, byte for byte", () => {
  const built = buildReport(F.EXPLANATION, CANONICAL_WINDOW, ANCHOR_NOW);
  const reference = F.buildReport(F.FIXTURE_SETTLED_AT, ANCHOR_NOW);

  /* Compared line by line first: a whole-body diff of a 26-line letter is
   * unreadable, and the line number is the whole diagnosis. */
  const got = built.body.split("\n");
  const want = reference.body.split("\n");
  for (let i = 0; i < Math.max(got.length, want.length); i++) {
    assert.equal(got[i], want[i], "body line " + i);
  }
  assert.deepEqual(built, reference);
  assert.deepEqual(built, DiscrepancyReport.parse(GENERATED.report));
});

test("the same report is assembled from the ENGINE's own explanation", () => {
  const explanation = calculate(MEERA_CYCLE, COMMITTED_POLICY);
  const window = buildDisputeWindow(explanation.settledAt, ANCHOR_NOW, explanation.settlementId);
  const built = buildReport(explanation, window, ANCHOR_NOW);

  /* The point of the whole file: the letter is assembled from reconciled
   * lines, so it must be identical whether it was handed the fixture or the
   * engine's own output. */
  assert.deepEqual(built, F.buildReport(F.FIXTURE_SETTLED_AT, ANCHOR_NOW));
});

test("every claim cross-links to a real line, and the claims ARE the difference", () => {
  const explanation = calculate(MEERA_CYCLE, COMMITTED_POLICY);
  const built = buildReport(explanation, CANONICAL_WINDOW, ANCHOR_NOW);
  const byId = new Map(explanation.lines.map((l) => [l.id, l]));

  assert.ok(built.claims.length > 0, "a report with no claims is not a report");

  for (const claim of built.claims) {
    const line = byId.get(claim.lineId);
    assert.ok(line, "claim cites line " + claim.lineId + ", which does not exist");
    /* The letter states an amount taken; the line carries it signed. */
    assert.equal(claim.amount, -line.amount, claim.lineId + " restates the wrong amount");
    /* The line's own citation object, carried through rather than rebuilt. */
    assert.equal(claim.citation, line.citation, claim.lineId + " carries a rebuilt citation");
    assert.ok(line.amountReconciled, claim.lineId + " is claimed but does not reconcile");
    /* Every claimed sentence appears in the body it summarises. */
    assert.ok(built.body.includes(claim.statement), "body omits: " + claim.statement);
    assert.ok(built.body.includes(formatPaise(claim.amount)), "body omits the amount");
  }

  const summed = built.claims.reduce((a, c) => a + c.amount, 0);
  assert.equal(built.disputedTotal, summed, "disputedTotal is not the sum of the claims");
  assert.equal(built.disputedTotal, explanation.unexplainedGap);
  assert.equal(built.disputedTotal, F.UNEXPLAINED_GAP);

  /* The gateway fee is the ceiling, not a claim: it reconciles, she simply
   * cannot check its composition. A letter that disputed it would be
   * accusing the rail of arithmetic it got right. */
  assert.equal(
    built.claims.find((c) => c.lineId === "L-01"),
    undefined,
    "the gateway fee must never be disputed",
  );
  assert.ok(built.body.includes("not disputed here"));
});

test("the body wraps to a fixed measure and its claim column lines up", () => {
  const built = buildReport(F.EXPLANATION, CANONICAL_WINDOW, ANCHOR_NOW);
  const lines = built.body.split("\n");

  for (const [i, line] of lines.entries()) {
    assert.ok(line.length <= 77, "body line " + i + " is " + line.length + " chars: " + line);
    assert.equal(line, line.trimEnd(), "body line " + i + " has trailing whitespace");
  }

  const rows = lines.filter((l) => l.startsWith("  "));
  assert.equal(rows.length, built.claims.length);

  const columns = rows.map((row, i) => {
    const claim = built.claims[i];
    assert.ok(claim);
    const amount = formatPaise(claim.amount);
    assert.ok(row.endsWith(amount), "claim row " + i + " does not end in its own amount");
    assert.ok(row.includes(claim.statement), "claim row " + i + " does not carry its statement");
    return row.length - amount.length;
  });
  assert.equal(new Set(columns).size, 1, "the amount column is ragged: " + columns.join(", "));
});

test("a report refuses a window belonging to another settlement", () => {
  const wrong = buildDisputeWindow(F.FIXTURE_SETTLED_AT, ANCHOR_NOW, "stl_someoneelse");
  assert.throws(
    () => buildReport(F.EXPLANATION, wrong, ANCHOR_NOW),
    /may not carry another settlement's deadline/,
  );
});

/* ============================================================ the forecast */

/**
 * The open cycle, built here rather than generated.
 *
 * It is the September cycle the shipped forecast projects: ₹4,10,000 captured
 * so far across four rails, ₹9,000 refunded, 380 failed attempts, no disputes
 * yet and nothing settled on demand. Every slice gross is a whole number of
 * rupees, so the per-slice fee sums to the aggregate exactly — which is what
 * lets this fixture prove the projection uses the settled engine's per-slice
 * aggregation without the rounding hiding the question.
 *
 * The gap is declared for the same reason the settled cycle declares it: the
 * recon report says "UPI" for both UPI rails here too.
 */
const OPEN_SLICES: ReadonlyArray<{ instrument: Instrument; reportedAs: string; gross: Paise }> = [
  { instrument: "upi_bank_account", reportedAs: "UPI", gross: rupees(250_000) },
  { instrument: "upi_rupay_credit", reportedAs: "UPI", gross: rupees(60_000) },
  { instrument: "card_credit", reportedAs: "Card", gross: rupees(80_000) },
  { instrument: "netbanking", reportedAs: "Netbanking", gross: rupees(20_000) },
];

const OPEN_CAPTURED_AT = T("2026-09-15T06:00:00.000Z");

const OPEN_PAYMENTS: RawPayment[] = OPEN_SLICES.map((s, i) => ({
  id: "pay_open" + String(i).padStart(2, "0"),
  amountPaise: s.gross,
  instrument: s.instrument,
  reportedAs: s.reportedAs,
  capturedAt: OPEN_CAPTURED_AT + i,
}));

const OPEN_REFUNDS: RawRefund[] = [
  {
    id: "rfnd_open00",
    paymentId: "pay_open00",
    amountPaise: rupees(9_000),
    refundedAt: OPEN_CAPTURED_AT + 3_600_000,
  },
];

const OPEN_FAILED: RawFailedAttempt[] = Array.from({ length: 380 }, (_, i) => ({
  id: "fail_open" + String(i).padStart(3, "0"),
  instrument: "upi_bank_account",
  errorCode: "BAD_REQUEST_ERROR",
  attemptedAt: OPEN_CAPTURED_AT + i,
}));

/** The same limitation the settled cycle declares, sized to this cycle. */
const OPEN_GAPS: SourceGap[] = [
  {
    id: "gap_instrument_sub_type",
    field: "instrument_sub_type",
    lookedIn: "settlement recon report row (`method` only, which reads UPI for all three rails)",
    consequence:
      "The gateway fee cannot be attributed across rails carrying different statutory MDR, so its basis cannot be checked from the report.",
    affectedCount: OPEN_PAYMENTS.filter((p) => p.reportedAs === "UPI").length,
  },
];

const OPEN_CYCLE: RawCycle = {
  id: "stl_2609mera01",
  cycleId: "cyc_202609",
  cycleLabel: "September 2026",
  periodStart: T("2026-08-31T18:30:00.000Z"),
  periodEnd: T("2026-09-30T18:29:59.999Z"),
  /* Not yet settled: this is when the cycle is expected to land. */
  settledAt: T("2026-10-03T05:30:00.000Z"),
  statedNetPaise: 0,
  status: "pending",
  merchant: MEERA_CYCLE.merchant,
  payments: OPEN_PAYMENTS,
  refunds: OPEN_REFUNDS,
  disputes: [],
  failedAttempts: OPEN_FAILED,
  settlement: {
    settlementId: "stl_2609mera01",
    settledAt: T("2026-10-03T05:30:00.000Z"),
    onDemand: false,
    onDemandBasePaise: 0,
    feesPaise: 0,
    taxPaise: 0,
    status: "pending",
  },
  gaps: OPEN_GAPS,
};

test("the open cycle fixture is the one the shipped forecast projects", () => {
  const captured = OPEN_CYCLE.payments.reduce((a, p) => a + p.amountPaise, 0);
  assert.equal(captured, rupees(410_000));
  assert.equal(OPEN_CYCLE.refunds.reduce((a, r) => a + r.amountPaise, 0), rupees(9_000));
  assert.equal(OPEN_CYCLE.failedAttempts.length, 380);
  assert.equal(OPEN_CYCLE.disputes.length, 0);

  /* Per-slice and aggregate agree here, so the deep-equal below is testing the
   * projection rather than the rounding. Asserted, never assumed. */
  const perSlice = OPEN_SLICES.reduce((a, s) => a + bps(s.gross, 200), 0);
  assert.equal(perSlice, bps(captured, 200));
});

test("the forecast reproduces the shipped payload, line for line", () => {
  const built = forecastOpenCycle(OPEN_CYCLE, COMMITTED_POLICY, ANCHOR_NOW);
  const reference = F.buildForecast(ANCHOR_NOW);

  for (let i = 0; i < Math.max(built.projectedLines.length, reference.projectedLines.length); i++) {
    assert.deepEqual(built.projectedLines[i], reference.projectedLines[i], "projected line " + i);
  }
  assert.deepEqual(built, reference);
  assert.deepEqual(built, Forecast.parse(GENERATED.forecast));
});

test("invariant 10 — the forecast claims no accuracy it has not measured", () => {
  const built = forecastOpenCycle(OPEN_CYCLE, COMMITTED_POLICY, ANCHOR_NOW);

  assert.equal(built.backtest.cycles, 0);
  assert.equal(built.backtest.method, "policy_engine_replay");
  /* The note is what makes 0/0 readable. A zero error beside an empty note is
   * indistinguishable from a perfect forecast. */
  assert.match(built.backtest.note, /never as zero error/);
  assert.match(built.backtest.note, /Not yet backtested/);
});

test("a projection carries nothing that has not happened yet", () => {
  const built = forecastOpenCycle(OPEN_CYCLE, COMMITTED_POLICY, ANCHOR_NOW);

  for (const line of built.projectedLines) {
    assert.equal(line.amountReconciled, false, line.id + " claims to reconcile against nothing");
    assert.equal(line.onMerchantReport, false, line.id + " claims a report that does not exist");
    assert.equal(line.count, null);
    assert.equal(line.unitAmount, null);
    if (!line.basisVerifiable) assert.ok(line.unverifiableReason, line.id + " has no reason");
  }

  /* No disputes and no on-demand settlement: those lines are absent, not zero. */
  const kinds = built.projectedLines.map((l) => l.kind);
  assert.ok(!kinds.includes("chargeback_principal"));
  assert.ok(!kinds.includes("chargeback_fee"));
  assert.ok(!kinds.includes("instant_settlement_fee"));

  /* The waterfall still closes: the signed components ARE the projected net. */
  const summed = built.projectedLines
    .filter((l) => l.kind !== "net_credited")
    .reduce((a, l) => a + l.amount, 0);
  assert.equal(summed, built.projectedNet);
  const last = built.projectedLines[built.projectedLines.length - 1];
  assert.ok(last);
  assert.equal(last.kind, "net_credited");
  assert.equal(last.runningBalance, built.projectedNet);
});

test("basisVerifiable is derived from the cycle's declared gaps, never assigned", () => {
  const withGap = forecastOpenCycle(OPEN_CYCLE, COMMITTED_POLICY, ANCHOR_NOW);
  const fee = withGap.projectedLines.find((l) => l.kind === "gateway_fee");
  assert.ok(fee);
  assert.equal(fee.basisVerifiable, false);

  /* A source that DID return the instrument sub-type must produce a checkable
   * projection. Hardcoding the flag on the fee line would report this cycle as
   * unverifiable too, which would make the ceiling an assertion about the
   * fixture rather than a measurement of any cycle. */
  const noGap = forecastOpenCycle({ ...OPEN_CYCLE, gaps: [] }, COMMITTED_POLICY, ANCHOR_NOW);
  for (const line of noGap.projectedLines) {
    assert.equal(line.basisVerifiable, true, line.id + " is unverifiable with no gap to lean on");
    assert.equal(line.unverifiableReason, null);
  }
});

test("the forecast refuses a policy no human has approved", () => {
  const firstLine = COMMITTED_POLICY.lines[0];
  assert.ok(firstLine);
  const unapproved = {
    ...COMMITTED_POLICY,
    lines: [{ ...firstLine, approved: false }, ...COMMITTED_POLICY.lines.slice(1)],
  };
  assert.throws(
    () => forecastOpenCycle(OPEN_CYCLE, unapproved, ANCHOR_NOW),
    /has not been approved by a human/,
  );
});

/* ====================================================== the wire invariant */

/**
 * A check that has never failed has never been tested.
 *
 * `tools/invariants/report.ts` runs over the wire, so the only seam it needs is
 * `fetchJson(path)`. The world below is built by the REAL engine — `calculate`,
 * `buildDisputeWindow`, `buildReport` — so the passing case is a second,
 * independent statement that the engine's payloads satisfy the invariant, and
 * every failing case is that same correct world with exactly one field moved.
 *
 * Mutations are relative (`+= 1`, a suffix on an id), never absolute, so
 * nothing here can quietly become a third fixture.
 */

interface Wire {
  explanation: Explanation;
  window: DisputeWindow;
  report: DiscrepancyReport;
  /** A path that answers with a dead socket instead of a payload. */
  dead?: string;
}

function cleanWire(now: number = ANCHOR_NOW): Wire {
  const explanation = calculate(MEERA_CYCLE, COMMITTED_POLICY);
  const window = buildDisputeWindow(explanation.settledAt, now, explanation.settlementId);
  return { explanation, window, report: buildReport(explanation, window, now) };
}

/** One field moved on an otherwise correct world. */
function mutate(fn: (w: Wire) => void, now: number = ANCHOR_NOW): Wire {
  const w = structuredClone(cleanWire(now));
  fn(w);
  return w;
}

function wireContext(world: Wire): InvariantContext {
  const id = world.explanation.settlementId;
  const body = (data: unknown) => ({ ok: true, data, requestId: "req_ws4_test" });
  return {
    base: "http://invariant.test",
    token: "",
    settlementId: id,
    async fetchJson(path: string): Promise<unknown> {
      if (world.dead === path) throw new Error("connect ECONNREFUSED");
      if (path === buildPath("getWindow", { settlementId: id })) return body(world.window);
      if (path === buildPath("getReport", { settlementId: id })) return body(world.report);
      if (path === buildPath("getExplanation", { settlementId: id })) return body(world.explanation);
      throw new Error("the check asked for a path nobody serves: " + path);
    },
  };
}

const fired = async (world: Wire): Promise<string[]> => {
  const problems = await reportCheck.run(wireContext(world));
  assert.ok(problems.length > 0, "the check did not fire at all");
  return problems;
};

test("report invariant · the engine's own payloads pass, unmutated", async () => {
  assert.equal(reportCheck.name, "report");
  assert.deepEqual(await reportCheck.run(wireContext(cleanWire())), []);
  /* And at both ends of the window, not only at the anchored hour. */
  assert.deepEqual(await reportCheck.run(wireContext(cleanWire(F.FIXTURE_SETTLED_AT))), []);
  assert.deepEqual(
    await reportCheck.run(wireContext(cleanWire(F.FIXTURE_SETTLED_AT + DISPUTE_WINDOW_MS))),
    [],
  );
});

test("report invariant fires · the deadline drifts off the three-day clause", async () => {
  const problems = await fired(
    mutate((w) => {
      w.window.deadlineAt += 3_600_000;
      w.report.window.deadlineAt += 3_600_000;
    }),
  );
  assert.ok(
    problems.some((p) => p.includes("deadlineAt") && p.includes("days after settlement")),
    problems.join(" | "),
  );
});

test("report invariant fires · the countdown disagrees with its own clock", async () => {
  const problems = await fired(
    mutate((w) => {
      w.window.msRemaining += 1;
      w.report.window.msRemaining += 1;
    }),
  );
  assert.ok(problems.some((p) => p.includes("msRemaining")), problems.join(" | "));
});

test("report invariant fires · a lapsed window still reads open", async () => {
  const expired = mutate((w) => {
    w.window.status = "open";
    w.report.window.status = "open";
  }, F.FIXTURE_SETTLED_AT + DISPUTE_WINDOW_MS);
  const problems = await fired(expired);
  assert.ok(
    problems.some((p) => p.includes("status is open") && p.includes("expired")),
    problems.join(" | "),
  );
});

test("report invariant fires · a claim cites a line that does not exist", async () => {
  const problems = await fired(
    mutate((w) => {
      const claim = w.report.claims[0];
      if (claim) claim.lineId = claim.lineId + "-gone";
    }),
  );
  assert.ok(
    problems.some((p) => p.includes("does not contain")),
    problems.join(" | "),
  );
});

test("report invariant fires · a claim no longer restates its own line", async () => {
  const problems = await fired(
    mutate((w) => {
      const claim = w.report.claims[0];
      if (claim) claim.amount += 1;
    }),
  );
  assert.ok(
    problems.some((p) => p.includes("but the line carries")),
    problems.join(" | "),
  );
});

test("report invariant fires · disputedTotal is not the sum of the claims", async () => {
  const problems = await fired(mutate((w) => void (w.report.disputedTotal += 1)));
  assert.ok(problems.some((p) => p.includes("disputedTotal")), problems.join(" | "));
});

test("report invariant fires · the report carries another settlement's window", async () => {
  const problems = await fired(
    mutate((w) => {
      w.report.window.settlementId = w.report.window.settlementId + "x";
    }),
  );
  assert.ok(
    problems.some((p) => p.includes("a deadline that is not hers")),
    problems.join(" | "),
  );
});

test("report invariant · a dead endpoint is reported, not thrown", async () => {
  const world = cleanWire();
  world.dead = buildPath("getReport", { settlementId: world.explanation.settlementId });
  const problems = await reportCheck.run(wireContext(world));
  assert.equal(problems.length, 1);
  assert.ok(problems[0]?.includes("did not answer"), problems.join(" | "));
});
