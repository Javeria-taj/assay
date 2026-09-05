import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_VERSION,
  buildPath,
  type Ceiling,
  type Explanation,
  type ExplanationLine,
  type LineKind,
  type SettlementSummary,
} from "@assay/contract";
import { COMMITTED_POLICY } from "../src/domain/committed-policy.js";
import { MEERA_CYCLE } from "../src/domain/meera.js";
import type { RawCycle } from "../src/domain/raw-cycle.js";
import { calculate } from "../src/engine/calculate.js";
import { analyseCeiling } from "../src/engine/ceiling.js";
import { HISTORICAL_SEEDS, generate } from "../src/sources/synthetic.js";
import { checks, type InvariantContext } from "../../../tools/invariants/index.js";
import { ceilingCheck } from "../../../tools/invariants/ceiling.js";
import { crossCycleCheck } from "../../../tools/invariants/cross-cycle.js";
import { waterfallCheck } from "../../../tools/invariants/waterfall.js";

/* ============================================================================
 * A check that has never failed has never been tested.
 *
 * The three invariant checks run over the WIRE — each takes an
 * `InvariantContext` with a `fetchJson(path)`. That is the whole seam this file
 * needs: a fake `fetchJson` backed by an in-memory world serves the same four
 * routes the checks ask for, so every case here runs in-process. No server, no
 * network, no deploy.
 *
 * The world is built from `calculate(MEERA_CYCLE, COMMITTED_POLICY)` and
 * `analyseCeiling(...)` — the real engine, not a hand-written payload. So the
 * POSITIVE cases are a second, independent statement that the engine's output
 * satisfies the invariants, and each NEGATIVE case is that same correct payload
 * with EXACTLY ONE field moved.
 *
 * NO AUTHORED EXPECTED RUPEE FIGURE APPEARS IN THIS FILE. Mutations are
 * relative (`+= 1`, `= x + 1`, `= null`), never absolute, so nothing here can
 * drift into being a third fixture. The only literals are structural: the
 * paisa a number is moved by, and the ten of `MAX_SETTLEMENTS`.
 *
 * Every negative case asserts three things: the check returned something, it
 * named the right failure, and — where one mutation can only break one
 * identity — it named exactly that many. The last is what would catch a check
 * that fires for the wrong reason, which is barely better than not firing.
 * ==========================================================================*/

/* ------------------------------------------------------------- the fake wire */

interface Settlement {
  summary: SettlementSummary;
  explanation: Explanation;
  ceiling: Ceiling;
}

interface World {
  /** What /v1/health claims. `cross-cycle` reads it, and only sometimes. */
  source: "mock" | "live";
  settlements: Settlement[];
  /** How many summaries /v1/settlements returns per page. */
  pageSize: number;
  /** Serve this instead of the real route, or `undefined` to fall through. May throw. */
  intercept?: (path: string) => unknown;
  /** Every path the check asked for, in order. Proof of what was covered. */
  calls: string[];
}

const envelope = (data: unknown): unknown => ({
  ok: true,
  data,
  requestId: "req_invariants_test",
});

/** A fixed clock. Nothing under test reads it; the schema only wants an integer. */
const SERVER_NOW = 1_756_000_000_000;

function serve(world: World, path: string): unknown {
  world.calls.push(path);

  if (world.intercept) {
    const forced = world.intercept(path);
    if (forced !== undefined) return forced;
  }

  const [route = "", query = ""] = path.split("?");

  if (route === buildPath("health")) {
    return envelope({
      status: "ok",
      contractVersion: CONTRACT_VERSION,
      source: world.source,
      serverNow: SERVER_NOW,
    });
  }

  if (route === buildPath("listSettlements")) {
    const cursor = new URLSearchParams(query).get("cursor");
    const start = cursor === null ? 0 : Number(cursor);
    const end = start + world.pageSize;
    return envelope({
      items: world.settlements.slice(start, end).map((s) => s.summary),
      nextCursor: end < world.settlements.length ? String(end) : null,
    });
  }

  const m = /^\/v1\/settlements\/([^/]+)\/(explanation|ceiling)$/.exec(route);
  if (m) {
    const id = decodeURIComponent(m[1] ?? "");
    const found = world.settlements.find((s) => s.summary.id === id);
    if (!found) throw new Error("404 no settlement " + id);
    return envelope(m[2] === "ceiling" ? found.ceiling : found.explanation);
  }

  throw new Error("404 no route " + path);
}

function ctxFor(world: World, settlementId?: string): InvariantContext {
  return {
    base: "http://invariants.test",
    token: "test-token",
    settlementId: settlementId ?? only(world).summary.id,
    fetchJson: async (path: string) => serve(world, path),
  };
}

/** Serve `how(path)` for the one route whose path ends in `suffix`. */
function failAt(world: World, suffix: string, how: (path: string) => unknown): void {
  world.intercept = (path) => (path.endsWith(suffix) ? how(path) : undefined);
}

/* -------------------------------------------------------- building the world */

function settlementOf(cycle: RawCycle): Settlement {
  const explanation = calculate(cycle, COMMITTED_POLICY);
  const ceiling = analyseCeiling(explanation);
  return {
    explanation,
    ceiling,
    summary: {
      id: explanation.settlementId,
      cycleId: explanation.cycleId,
      cycleLabel: explanation.cycleLabel,
      settledAt: explanation.settledAt,
      grossCaptured: explanation.grossCaptured,
      netCredited: explanation.netCredited,
      merchantExpected: explanation.merchantExpected,
      unexplainedGap: explanation.unexplainedGap,
      windowStatus: "open",
      basisUnverifiableShare: ceiling.basisUnverifiable.share,
    },
  };
}

/** Computed once from the real engine; every world takes a deep copy. */
const MEERA = settlementOf(MEERA_CYCLE);
const GENERATED: Settlement[] = HISTORICAL_SEEDS.slice(0, 3).map((seed) =>
  settlementOf(generate(seed)),
);

function worldOf(
  settlements: readonly Settlement[],
  source: "mock" | "live",
  pageSize = 10,
): World {
  return { source, settlements: settlements.map((s) => structuredClone(s)), pageSize, calls: [] };
}

/** One settlement, served as the fixture mock serves it. The default subject. */
const meeraWorld = (source: "mock" | "live" = "mock"): World => worldOf([MEERA], source);

/** The same settlement under a different id, for filling a list. */
function withId(s: Settlement, id: string): Settlement {
  const copy = structuredClone(s);
  copy.summary.id = id;
  copy.explanation.settlementId = id;
  copy.ceiling.settlementId = id;
  return copy;
}

/* ------------------------------------------------------------ reaching inside */

function only(world: World): Settlement {
  const s = world.settlements[0];
  if (!s) throw new Error("the world holds no settlements");
  return s;
}

function at(world: World, i: number): Settlement {
  const s = world.settlements[i];
  if (!s) throw new Error("the world holds no settlement at index " + i);
  return s;
}

function lineOfKind(e: Explanation, kind: LineKind): ExplanationLine {
  const l = e.lines.find((x) => x.kind === kind);
  if (!l) throw new Error("the explanation carries no " + kind + " line");
  return l;
}

function lastLine(e: Explanation): ExplanationLine {
  const l = e.lines[e.lines.length - 1];
  if (!l) throw new Error("the explanation carries no lines");
  return l;
}

function sliceAt(e: Explanation, i: number) {
  const s = e.instrumentMix[i];
  if (!s) throw new Error("the instrument mix has no slice at index " + i);
  return s;
}

/* -------------------------------------------------------- the negative harness */

interface Negative {
  /** What one field was moved, phrased as the operator would read it. */
  name: string;
  /** The single mutation. Nothing else in the world changes. */
  mutate: (world: World) => void;
  /** A substring that must appear in at least one returned problem. */
  names: string;
  /**
   * How many problems this one mutation can legitimately produce. `null` where
   * a single moved field genuinely breaks several identities at once — and the
   * comment on that row says which.
   */
  exactly: number | null;
}

function runNegatives(
  label: string,
  cases: readonly Negative[],
  run: (ctx: InvariantContext) => Promise<string[]>,
): void {
  for (const c of cases) {
    test(label + " fires · " + c.name, async () => {
      const world = meeraWorld();
      c.mutate(world);
      const problems = await run(ctxFor(world));

      assert.ok(
        problems.length > 0,
        "the check returned [] for a payload that is wrong — it is blind to: " + c.name,
      );
      assert.ok(
        problems.some((p) => p.includes(c.names)),
        "no problem named " +
          JSON.stringify(c.names) +
          " — the check fired, but for the wrong reason. Got: " +
          JSON.stringify(problems, null, 2),
      );
      if (c.exactly !== null) {
        assert.equal(
          problems.length,
          c.exactly,
          "one moved field should produce " +
            c.exactly +
            " problem(s). Got: " +
            JSON.stringify(problems, null, 2),
        );
      }
    });
  }
}

/* ============================================================================
 * 0 · the registry
 * ==========================================================================*/

test("all three checks are registered, so what is proved here is what runs", () => {
  const names = checks.map((c) => c.name);
  for (const expected of ["waterfall", "ceiling", "cross-cycle"]) {
    assert.ok(names.includes(expected), "checks[] does not register " + expected + ": " + names);
  }
});

/* ============================================================================
 * 1 · waterfall — W1..W5
 * ==========================================================================*/

test("waterfall · the engine's own output passes, unmutated", async () => {
  const problems = await waterfallCheck.run(ctxFor(meeraWorld()));
  assert.deepEqual(problems, [], "calculate(MEERA_CYCLE, COMMITTED_POLICY) violates W1–W5");
});

test("waterfall · every generated cycle passes too, so the pass is not one payload", async () => {
  for (const s of GENERATED) {
    const world = worldOf([s], "mock");
    const problems = await waterfallCheck.run(ctxFor(world));
    assert.deepEqual(problems, [], s.summary.id + " violates W1–W5: " + JSON.stringify(problems));
  }
});

const WATERFALL_NEGATIVES: readonly Negative[] = [
  {
    name: "W1 · a line amount is off by one paisa",
    mutate: (w) => {
      lineOfKind(only(w).explanation, "failed_payment_fee").amount += 1;
    },
    names: "W1 signed lines do not sum to netCredited",
    exactly: 1,
  },
  {
    name: "W1 · reconciliation.delta is set non-zero",
    mutate: (w) => {
      only(w).explanation.reconciliation.delta = 1;
    },
    names: "W1 reconciliation.delta is not zero",
    exactly: 1,
  },
  {
    name: "W1 · reconciliation.ok is false while an Explanation was still served",
    mutate: (w) => {
      only(w).explanation.reconciliation.ok = false;
    },
    names: "W1 reconciliation.ok is false",
    exactly: 1,
  },
  {
    name: "W2 · the last line is not the net marker",
    mutate: (w) => {
      lastLine(only(w).explanation).kind = "adjustment";
    },
    names: "not net_credited",
    exactly: 1,
  },
  {
    name: "W2 · the net marker carries money",
    mutate: (w) => {
      lastLine(only(w).explanation).amount = 1;
    },
    names: "is a marker and must carry 0",
    exactly: 1,
  },
  {
    name: "W2 · the net marker's runningBalance drifts from netCredited",
    mutate: (w) => {
      lastLine(only(w).explanation).runningBalance += 1;
    },
    names: "runningBalance does not equal netCredited",
    exactly: 1,
  },
  {
    name: "W3 · a deduction raises the running balance",
    mutate: (w) => {
      const e = only(w).explanation;
      lineOfKind(e, "tax_on_fees").runningBalance =
        lineOfKind(e, "refund_principal").runningBalance + 1;
    },
    names: "raised the running balance above",
    exactly: 1,
  },
  {
    name: "W4 · an instrument slice gross is mutated",
    mutate: (w) => {
      sliceAt(only(w).explanation, 0).grossCaptured += 1;
    },
    names: "W4 instrumentMix gross does not decompose grossCaptured",
    exactly: 1,
  },
  {
    name: "W4 · an instrument slice fee is mutated",
    mutate: (w) => {
      sliceAt(only(w).explanation, 2).feeCharged += 1;
    },
    names: "W4 instrumentMix fee does not decompose",
    exactly: 1,
  },
  {
    name: "W5 · a line cites nothing",
    mutate: (w) => {
      lineOfKind(only(w).explanation, "chargeback_principal").citation.sourceId = "";
    },
    names: "cites nothing",
    exactly: 1,
  },
  {
    name: "W5 · an unverifiable line's unverifiableReason is stripped",
    mutate: (w) => {
      const l = lineOfKind(only(w).explanation, "gateway_fee");
      assert.equal(l.basisVerifiable, false, "the gateway fee line is the unverifiable one");
      l.unverifiableReason = null;
    },
    names: "is unverifiable and names no missing field",
    exactly: 1,
  },
  {
    name: "W5 · a verifiable line carries an unverifiable reason anyway",
    mutate: (w) => {
      const l = lineOfKind(only(w).explanation, "refund_principal");
      assert.equal(l.basisVerifiable, true, "the refund principal line is a verifiable one");
      l.unverifiableReason = "a reason it has no business carrying";
    },
    names: "is verifiable yet carries an unverifiable reason",
    exactly: 1,
  },
  {
    name: "envelope · the endpoint answers with something that is not an Explanation",
    mutate: (w) => failAt(w, "/explanation", () => envelope({ settlementId: "stl_2608mera01" })),
    names: "not a valid Explanation envelope",
    exactly: 1,
  },
  {
    name: "envelope · the endpoint answers ok=false",
    mutate: (w) =>
      failAt(w, "/explanation", () => ({
        ok: false,
        error: { code: "not_found", message: "no such settlement", field: null },
        requestId: "req_x",
      })),
    names: "not a valid Explanation envelope",
    exactly: 1,
  },
];

runNegatives("waterfall", WATERFALL_NEGATIVES, (ctx) => waterfallCheck.run(ctx));

test("waterfall · a dead endpoint is reported, not thrown", async () => {
  /* tools/invariants/index.ts: "It never throws, never exits, and never prints
   * — tools/verify-contract.ts owns the table." A check that rejects instead of
   * returning takes the table down with it. */
  const world = meeraWorld();
  failAt(world, "/explanation", () => {
    throw new Error("ECONNREFUSED 127.0.0.1:8787");
  });

  let problems: string[];
  try {
    problems = await waterfallCheck.run(ctxFor(world));
  } catch (e) {
    assert.fail(
      "the waterfall check threw instead of returning a problem string: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
  assert.ok(problems.length > 0, "a dead endpoint returned no problems");
  assert.ok(
    problems.some((p) => p.includes("ECONNREFUSED")),
    "the problem does not say what actually went wrong: " + JSON.stringify(problems),
  );
});

/* ============================================================================
 * 2 · ceiling — the two axes, the partition, and the stale-cache cross-check
 * ==========================================================================*/

test("ceiling · the engine's own pair passes, unmutated", async () => {
  const problems = await ceilingCheck.run(ctxFor(meeraWorld()));
  assert.deepEqual(problems, [], "analyseCeiling(calculate(...)) violates its own identities");
});

test("ceiling · every generated pair passes too", async () => {
  for (const s of GENERATED) {
    const problems = await ceilingCheck.run(ctxFor(worldOf([s], "mock")));
    assert.deepEqual(problems, [], s.summary.id + " violates the ceiling identities");
  }
});

const CEILING_NEGATIVES: readonly Negative[] = [
  {
    /* totalDelta is load-bearing for both axis sums, so moving it breaks three. */
    name: "totalDelta no longer equals gross − net",
    mutate: (w) => {
      only(w).ceiling.totalDelta -= 1;
    },
    names: "but gross − net is",
    exactly: null,
  },
  {
    name: "a ceiling bucket amount is mutated — the reconciled axis stops summing to totalDelta",
    mutate: (w) => {
      only(w).ceiling.amountReconciled.amount += 1;
    },
    names: "the reconciled axis sums to",
    exactly: 1,
  },
  {
    name: "a ceiling bucket amount is mutated — the basis axis stops summing to totalDelta",
    mutate: (w) => {
      only(w).ceiling.basisVerifiable.amount += 1;
    },
    names: "the basis axis sums to",
    exactly: 1,
  },
  {
    name: "the reconciled shares stop summing to 1",
    mutate: (w) => {
      only(w).ceiling.amountReconciled.share = 0.5;
    },
    names: "the reconciled shares sum to",
    exactly: 1,
  },
  {
    name: "the basis shares stop summing to 1",
    mutate: (w) => {
      only(w).ceiling.basisVerifiable.share = 0.5;
    },
    names: "the basis shares sum to",
    exactly: 1,
  },
  {
    name: "a missingFields wouldResolve is mutated — the partition stops closing",
    mutate: (w) => {
      const m = only(w).ceiling.missingFields[0];
      if (!m) throw new Error("the ceiling names no missing fields");
      m.wouldResolve -= 1;
    },
    names: "missingFields resolve",
    exactly: 1,
  },
  {
    name: "a missing field carries an empty citation sourceId",
    mutate: (w) => {
      const m = only(w).ceiling.missingFields[1] ?? only(w).ceiling.missingFields[0];
      if (!m) throw new Error("the ceiling names no missing fields");
      m.citation.sourceId = "";
    },
    names: "carries an empty citation sourceId",
    exactly: 1,
  },
  {
    name: "annualisedFee is not twelve months of the monthly fee",
    mutate: (w) => {
      only(w).ceiling.zeroMdrExposure.annualisedFee += 1;
    },
    names: "is not twelve months of",
    exactly: 1,
  },
  {
    name: "the fee levied on zero-MDR rails exceeds the gross that sat on them",
    mutate: (w) => {
      /* Move the gross, not the fee: the fee is what annualisedFee is twelve of,
       * so this isolates the containment check from the annualisation one. */
      const z = only(w).ceiling.zeroMdrExposure;
      z.grossOnZeroMdrRails = z.feeLeviedOnZeroMdrRails - 1;
    },
    names: "fee levied on zero-MDR rails exceeds the gross that sat on them",
    exactly: 1,
  },
  {
    name: "STALE CACHE · the explanation's line flags moved and the ceiling did not",
    mutate: (w) => {
      /* Nothing in the ceiling is touched. Every axis still sums, every share
       * still pairs to 1, the partition still closes. Only the cross-check
       * against the explanation's own flags can see this. */
      lineOfKind(only(w).explanation, "gateway_fee").basisVerifiable = true;
    },
    names: "which is what a stale ceiling looks like",
    exactly: 1,
  },
  {
    /* Both halves move by the same paisa, so the axis STILL sums to totalDelta.
     * The partition check and the line cross-check are the only two that see it. */
    name: "STALE CACHE · the basis split is wrong while the axis still balances",
    mutate: (w) => {
      const c = only(w).ceiling;
      c.basisUnverifiable.amount -= 1;
      c.basisVerifiable.amount += 1;
    },
    names: "which is what a stale ceiling looks like",
    exactly: 2,
  },
  {
    name: "the ceiling is for a different settlement than the explanation",
    mutate: (w) => {
      only(w).ceiling.settlementId = "stl_someoneelse";
    },
    names: "but the explanation is for",
    exactly: 1,
  },
  {
    name: "endpoint · the ceiling route does not answer at all",
    mutate: (w) =>
      failAt(w, "/ceiling", () => {
        throw new Error("ECONNREFUSED 127.0.0.1:8787");
      }),
    names: "did not answer",
    exactly: 1,
  },
  {
    name: "endpoint · the ceiling route answers ok=false",
    mutate: (w) =>
      failAt(w, "/ceiling", () => ({
        ok: false,
        error: { code: "not_found", message: "no such settlement", field: null },
        requestId: "req_x",
      })),
    names: "returned ok=false",
    exactly: 1,
  },
  {
    name: "endpoint · the ceiling route answers something that is not an object",
    mutate: (w) => failAt(w, "/ceiling", () => "not an object"),
    names: "returned something that is not an object",
    exactly: 1,
  },
  {
    name: "endpoint · the ceiling route answers a payload the frozen schema rejects",
    mutate: (w) => failAt(w, "/ceiling", () => envelope({ settlementId: "stl_2608mera01" })),
    names: "does not match the frozen schema at",
    exactly: 1,
  },
];

runNegatives("ceiling", CEILING_NEGATIVES, (ctx) => ceilingCheck.run(ctx));

/* ============================================================================
 * 3 · cross-cycle — the same identities over the whole list
 * ==========================================================================*/

test("cross-cycle · the single-settlement mock passes", async () => {
  const problems = await crossCycleCheck.run(ctxFor(meeraWorld("mock")));
  assert.deepEqual(problems, [], JSON.stringify(problems));
});

test("cross-cycle · a multi-settlement live list passes, across two pages", async () => {
  const world = worldOf([MEERA, ...GENERATED], "live", 2);
  const problems = await crossCycleCheck.run(ctxFor(world));
  assert.deepEqual(problems, [], JSON.stringify(problems));
  assert.ok(
    world.calls.filter((p) => p.startsWith(buildPath("listSettlements"))).length > 1,
    "the check did not page: " + JSON.stringify(world.calls),
  );
});

test("cross-cycle fires · it catches a settlement the ceiling check never looks at", async () => {
  /* The load-bearing claim of this check. Break the LAST settlement in the list
   * and point ctx at the FIRST: `ceiling` is clean, `cross-cycle` is not. */
  const world = worldOf([MEERA, ...GENERATED], "live", 2);
  const target = at(world, 3);
  target.ceiling.amountUnreconciled.amount += 1;
  const ctx = ctxFor(world, at(world, 0).summary.id);

  assert.deepEqual(
    await ceilingCheck.run(ctx),
    [],
    "the ceiling check should see nothing — it only looks at ctx.settlementId",
  );

  const problems = await crossCycleCheck.run(ctx);
  assert.ok(problems.length > 0, "cross-cycle covered only ctx.settlementId, which is the bug");
  assert.ok(
    problems.some((p) => p.startsWith(target.summary.id + ":")),
    "the problem does not name " + target.summary.id + ": " + JSON.stringify(problems),
  );
});

test("cross-cycle fires · a live deploy that lists exactly one settlement", async () => {
  const problems = await crossCycleCheck.run(ctxFor(meeraWorld("live")));
  assert.ok(
    problems.some((p) => p.includes("covered nothing the ceiling check did not")),
    "a one-settlement live list passed silently: " + JSON.stringify(problems),
  );
  assert.equal(problems.length, 1, JSON.stringify(problems));
});

test("cross-cycle fires · an empty settlements list", async () => {
  const problems = await crossCycleCheck.run(ctxFor(worldOf([], "live"), "stl_absent01"));
  assert.deepEqual(problems, [
    "cross-cycle: /v1/settlements listed nothing, so no ceiling was cross-checked",
  ]);
});

test("cross-cycle fires · the list repeats an id", async () => {
  const world = worldOf([MEERA, MEERA], "live");
  const problems = await crossCycleCheck.run(ctxFor(world));
  assert.ok(
    problems.some((p) => p.includes("repeats an id, so the page cursor is wrong")),
    JSON.stringify(problems),
  );
  assert.equal(problems.length, 1, JSON.stringify(problems));
});

test("cross-cycle fires · the settlements list itself does not answer", async () => {
  const world = meeraWorld("live");
  world.intercept = (path) => {
    if (path.startsWith(buildPath("listSettlements"))) throw new Error("ECONNREFUSED");
    return undefined;
  };
  const problems = await crossCycleCheck.run(ctxFor(world));
  assert.ok(
    problems.some((p) => p.includes("settlements list") && p.includes("did not answer")),
    JSON.stringify(problems),
  );
  assert.equal(problems.length, 1, JSON.stringify(problems));
});

test("cross-cycle · a server that returns the same cursor forever terminates", async () => {
  /* Not hypothetical: a paging bug that never advances the cursor would page
   * until the run was killed. The check must stop and say something instead. */
  const world = meeraWorld("live");
  const stuck = envelope({ items: [only(world).summary], nextCursor: "always-the-same" });
  world.intercept = (path) => (path.startsWith(buildPath("listSettlements")) ? stuck : undefined);

  const problems = await crossCycleCheck.run(ctxFor(world));
  assert.ok(
    problems.some((p) => p.includes("repeats an id, so the page cursor is wrong")),
    JSON.stringify(problems),
  );
});

test("cross-cycle · MAX_SETTLEMENTS caps coverage at ten, and the cap is real", async () => {
  /* Twelve settlements, all consistent, so the run is clean — but only ten are
   * looked at. An operator reading a green table should know that number. */
  const many = Array.from({ length: 12 }, (_, i) => withId(MEERA, "stl_capped" + (i + 100)));
  const world = worldOf(many, "live", 2);

  const problems = await crossCycleCheck.run(ctxFor(world, "stl_capped100"));
  assert.deepEqual(problems, [], JSON.stringify(problems));

  const covered = new Set(
    world.calls
      .map((p) => /^\/v1\/settlements\/([^/]+)\/ceiling$/.exec(p)?.[1])
      .filter((id): id is string => id !== undefined),
  );
  assert.equal(covered.size, 10, "coverage was " + covered.size + " of 12 listed settlements");
});
