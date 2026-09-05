import type { InvariantCheck, InvariantContext } from "./index.js";
import { buildPath, Ceiling, Explanation, Health } from "../../packages/contract/src/contract.js";

/**
 * Both axes sum to totalDelta and the missing fields partition it — asserted
 * over the WIRE, against whatever is deployed.
 *
 * These check a PAYLOAD, never an implementation, which is why the same check
 * catches a stale cache, a bad deploy and a broken mapper alike. The one that
 * earns its keep is the last: `basisUnverifiable.amount` is re-derived from the
 * explanation's own line flags and compared to what the ceiling endpoint
 * served. A ceiling served from a cache that predates the explanation fails
 * there and nowhere else.
 *
 * `run` returns `[]` for pass, or human-readable problem strings. It never
 * throws, never exits, and never prints — `tools/verify-contract.ts` owns the
 * table.
 */

/* --------------------------------------------------------------- plumbing */

/**
 * The shape of a zod schema, described structurally so this file does not
 * import zod. `tools/` has no dependencies of its own and adding one to reach a
 * `safeParse` would be a strange thing to install for a type.
 */
export interface Parser<T> {
  safeParse(
    value: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }> } };
}

export type Fetched<T> = { value: T } | { problem: string };

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Unwraps the envelope and validates the payload against the frozen schema. */
export async function fetchParsed<T>(
  ctx: InvariantContext,
  path: string,
  schema: Parser<T>,
  where: string,
): Promise<Fetched<T>> {
  let body: unknown;
  try {
    body = await ctx.fetchJson(path);
  } catch (e) {
    return { problem: where + ": GET " + path + " did not answer — " + describe(e) };
  }
  if (typeof body !== "object" || body === null) {
    return { problem: where + ": GET " + path + " returned something that is not an object" };
  }
  const envelope = body as Record<string, unknown>;
  if (envelope["ok"] !== true) {
    return {
      problem: where + ": GET " + path + " returned ok=false — " + JSON.stringify(envelope["error"] ?? null),
    };
  }
  const parsed = schema.safeParse(envelope["data"]);
  if (!parsed.success) {
    const at = parsed.error.issues
      .slice(0, 3)
      .map((i) => i.path.map(String).join("."))
      .join(", ");
    return { problem: where + ": GET " + path + " does not match the frozen schema at " + at };
  }
  return { value: parsed.data };
}

/** "mock" means the single-fixture deployment; a live one is expected to list many. */
export async function sourceOf(ctx: InvariantContext): Promise<string> {
  const health = await fetchParsed(ctx, buildPath("health"), Health, "health");
  return "value" in health ? health.value.source : "unknown";
}

/* ------------------------------------------------------------- the checks */

/**
 * Exactly what a wrong deploy would break. Shared with `cross-cycle.ts`, which
 * runs it over every settlement in the list rather than just `ctx.settlementId`.
 */
export function ceilingProblems(where: string, c: Ceiling, e: Explanation): string[] {
  const problems: string[] = [];
  const say = (msg: string) => problems.push(where + ": " + msg);

  const delta = e.grossCaptured - e.netCredited;
  if (c.totalDelta !== delta) {
    say("totalDelta is " + c.totalDelta + "p, but gross − net is " + delta + "p");
  }

  const axisAmount = c.amountReconciled.amount + c.amountUnreconciled.amount;
  if (axisAmount !== c.totalDelta) {
    say("the reconciled axis sums to " + axisAmount + "p, not totalDelta " + c.totalDelta + "p");
  }

  const axisBasis = c.basisVerifiable.amount + c.basisUnverifiable.amount;
  if (axisBasis !== c.totalDelta) {
    say("the basis axis sums to " + axisBasis + "p, not totalDelta " + c.totalDelta + "p");
  }

  const pairAmount = c.amountReconciled.share + c.amountUnreconciled.share;
  const pairBasis = c.basisVerifiable.share + c.basisUnverifiable.share;
  if (Math.round(pairAmount * 10_000) !== 10_000) say("the reconciled shares sum to " + pairAmount);
  if (Math.round(pairBasis * 10_000) !== 10_000) say("the basis shares sum to " + pairBasis);

  const resolved = c.missingFields.reduce((a, m) => a + m.wouldResolve, 0);
  if (resolved !== c.basisUnverifiable.amount) {
    say(
      "missingFields resolve " + resolved + "p but basisUnverifiable is " + c.basisUnverifiable.amount + "p",
    );
  }
  for (const m of c.missingFields) {
    if (!m.citation.sourceId) say("missing field " + m.id + " carries an empty citation sourceId");
  }

  const z = c.zeroMdrExposure;
  if (z.annualisedFee !== z.feeLeviedOnZeroMdrRails * 12) {
    say("annualisedFee " + z.annualisedFee + "p is not twelve months of " + z.feeLeviedOnZeroMdrRails + "p");
  }
  if (z.feeLeviedOnZeroMdrRails > z.grossOnZeroMdrRails) {
    say("fee levied on zero-MDR rails exceeds the gross that sat on them");
  }

  /* The cross-check that catches a ceiling served from a stale cache: the
   * unverifiable amount, re-derived from the explanation's OWN line flags. The
   * contribution is a negation, not an absolute value — a positive adjustment
   * shrinks the bucket. */
  const fromLines = e.lines
    .filter((l) => l.kind !== "gross_captured" && l.kind !== "net_credited")
    .filter((l) => !l.basisVerifiable)
    .reduce((a, l) => a - l.amount, 0);
  if (fromLines !== c.basisUnverifiable.amount) {
    say(
      "basisUnverifiable is " +
        c.basisUnverifiable.amount +
        "p but the explanation's unverifiable lines sum to " +
        fromLines +
        "p — the two endpoints disagree, which is what a stale ceiling looks like",
    );
  }

  if (c.settlementId !== e.settlementId) {
    say("the ceiling is for " + c.settlementId + " but the explanation is for " + e.settlementId);
  }

  return problems;
}

/** Fetches both endpoints for one settlement and runs the identities over them. */
export async function checkOneSettlement(ctx: InvariantContext, settlementId: string): Promise<string[]> {
  const [ceiling, explanation] = await Promise.all([
    fetchParsed(ctx, buildPath("getCeiling", { settlementId }), Ceiling, settlementId),
    fetchParsed(ctx, buildPath("getExplanation", { settlementId }), Explanation, settlementId),
  ]);
  if ("problem" in ceiling) return [ceiling.problem];
  if ("problem" in explanation) return [explanation.problem];
  return ceilingProblems(settlementId, ceiling.value, explanation.value);
}

export const ceilingCheck: InvariantCheck = {
  name: "ceiling",
  async run(ctx) {
    try {
      return await checkOneSettlement(ctx, ctx.settlementId);
    } catch (e) {
      /* A check never throws. An unexpected failure is itself a problem string. */
      return ["ceiling: the check itself failed — " + describe(e)];
    }
  },
};
