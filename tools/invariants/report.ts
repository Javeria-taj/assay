import type { InvariantCheck, InvariantContext } from "./index.js";
import {
  buildPath,
  DiscrepancyReport,
  DisputeWindow,
  Explanation,
} from "../../packages/contract/src/contract.js";
import { fetchParsed } from "./ceiling.js";

/**
 * The three-day window and the letter it lets her send — asserted over the
 * WIRE, against whatever is deployed.
 *
 * These are the two payloads where being wrong is not a display bug. A deadline
 * an hour late is a contractual right she loses believing she still has it, and
 * a claim citing a line that does not exist is a letter she sends under her own
 * name that the counterparty can dismiss on sight. So the checks below are
 * chosen to be exactly what a wrong deploy would break:
 *
 *   the deadline is three days after settlement, per the clause the payload
 *   itself quotes — the number is transcribed from the terms here, and
 *   independently re-read out of the served quote, so this check cannot pass by
 *   agreeing with the implementation's own constant;
 *
 *   the countdown agrees with the clock the same response reported, and the
 *   status agrees with the threshold the same response declared;
 *
 *   every claim resolves to a real explanation line carrying that exact amount,
 *   which is what a report served from a cache that predates the explanation
 *   fails, and nothing else does;
 *
 *   the disputed total is the sum of the claims, so the headline figure cannot
 *   drift from the lines that justify it.
 *
 * `run` returns `[]` for pass, or human-readable problem strings. It never
 * throws, never exits, and never prints — `tools/verify-contract.ts` owns the
 * table.
 */

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Transcribed from the clause, not imported from the engine.
 *
 * "You shall report ... within three (3) days upon the receipt of the fund
 * settlements." An invariant that imported `DISPUTE_WINDOW_MS` would pass for
 * any value that constant happened to hold, which is the one thing it is here
 * to catch.
 */
const CLAUSE_DAYS = 3;

/** Reads the window length back out of the served quote: "three (3) days". */
function daysInQuote(quote: string | null): number | null {
  if (!quote) return null;
  const m = /\((\d+)\)\s*(?:calendar\s+)?days?/i.exec(quote);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* --------------------------------------------------------------- the window */

/** Shared with the report's own embedded copy, which is checked identically. */
export function windowProblems(where: string, w: DisputeWindow): string[] {
  const problems: string[] = [];
  const say = (msg: string) => problems.push(where + ": " + msg);

  const expected = w.settledAt + CLAUSE_DAYS * MS_PER_DAY;
  if (w.deadlineAt !== expected) {
    say(
      "deadlineAt is " +
        w.deadlineAt +
        " but the clause puts it " +
        CLAUSE_DAYS +
        " days after settlement, at " +
        expected +
        " — off by " +
        (w.deadlineAt - expected) +
        "ms",
    );
  }

  const quoted = daysInQuote(w.clause.quote);
  if (quoted !== null && w.deadlineAt - w.settledAt !== quoted * MS_PER_DAY) {
    say(
      "the clause served with this window quotes " +
        quoted +
        " days, but the window it is attached to is " +
        (w.deadlineAt - w.settledAt) / MS_PER_DAY +
        " days long",
    );
  }
  if (!w.clause.sourceId) say("the window carries a clause with an empty sourceId");

  if (w.msRemaining !== w.deadlineAt - w.serverNow) {
    say(
      "msRemaining is " +
        w.msRemaining +
        " but deadlineAt − serverNow is " +
        (w.deadlineAt - w.serverNow) +
        " — the countdown disagrees with the clock in its own response",
    );
  }

  if (w.closingThresholdMs <= 0) {
    say("closingThresholdMs is " + w.closingThresholdMs + ", which no status can be measured against");
  }

  /* The status the UI colours the countdown with, re-derived from the numbers
   * the same response served. "open" on a lapsed window is the failure that
   * costs her the right. */
  const expectedStatus =
    w.msRemaining <= 0 ? "expired" : w.msRemaining <= w.closingThresholdMs ? "closing" : "open";
  if (w.status !== expectedStatus) {
    say(
      "status is " +
        w.status +
        " with " +
        w.msRemaining +
        "ms remaining against a " +
        w.closingThresholdMs +
        "ms threshold, which reads " +
        expectedStatus,
    );
  }

  return problems;
}

/* --------------------------------------------------------------- the report */

export function reportProblems(
  where: string,
  r: DiscrepancyReport,
  w: DisputeWindow,
  e: Explanation,
): string[] {
  const problems: string[] = [...windowProblems(where + " · report.window", r.window)];
  const say = (msg: string) => problems.push(where + ": " + msg);

  if (r.settlementId !== e.settlementId) {
    say("the report is for " + r.settlementId + " but the explanation is for " + e.settlementId);
  }
  if (r.window.settlementId !== r.settlementId) {
    say(
      "the report is for " +
        r.settlementId +
        " but carries the window of " +
        r.window.settlementId +
        " — a deadline that is not hers",
    );
  }

  /* The window endpoint and the copy embedded in the report must describe the
   * same deadline. `serverNow` and `msRemaining` legitimately differ: they were
   * computed on two different requests. Everything else must not. */
  if (r.window.settledAt !== w.settledAt || r.window.deadlineAt !== w.deadlineAt) {
    say(
      "the report's window closes at " +
        r.window.deadlineAt +
        " but the window endpoint says " +
        w.deadlineAt +
        " — two answers to the same question",
    );
  }

  if (r.window.settledAt !== e.settledAt) {
    say(
      "the window is measured from " +
        r.window.settledAt +
        " but the settlement landed at " +
        e.settledAt,
    );
  }

  if (r.claims.length === 0) say("the report carries no claims at all");
  if (!r.subject) say("the report has an empty subject");
  if (!r.body) say("the report has an empty body");

  const byId = new Map(e.lines.map((l) => [l.id, l]));
  for (const claim of r.claims) {
    const line = byId.get(claim.lineId);
    if (!line) {
      say(
        "claim \"" +
          claim.statement +
          '" cites line ' +
          claim.lineId +
          ", which this settlement's explanation does not contain",
      );
      continue;
    }
    /* A letter states the amount taken; the line carries it signed. A claim
     * that does not restate its own line is a report built against a different
     * cycle — which is exactly what a stale cache serves. */
    if (claim.amount !== -line.amount) {
      say(
        "claim on " +
          claim.lineId +
          " states " +
          claim.amount +
          "p but the line carries " +
          line.amount +
          "p",
      );
    }
    if (!claim.citation.sourceId) say("claim on " + claim.lineId + " carries no citation");
    /* Machine-checkable AND cross-linked: the UI highlights the claim inside
     * the body, so a statement missing from the body has nothing to link to. */
    if (!r.body.includes(claim.statement)) {
      say('claim "' + claim.statement + '" does not appear in the body it summarises');
    }
  }

  const summed = r.claims.reduce((a, c) => a + c.amount, 0);
  if (r.disputedTotal !== summed) {
    say(
      "disputedTotal is " +
        r.disputedTotal +
        "p but the claims sum to " +
        summed +
        "p — the headline figure is not the lines that justify it",
    );
  }

  return problems;
}

/* ----------------------------------------------------------------- the check */

export const reportCheck: InvariantCheck = {
  name: "report",
  async run(ctx: InvariantContext): Promise<string[]> {
    try {
      const id = ctx.settlementId;
      const [window, report, explanation] = await Promise.all([
        fetchParsed(ctx, buildPath("getWindow", { settlementId: id }), DisputeWindow, id),
        fetchParsed(ctx, buildPath("getReport", { settlementId: id }), DiscrepancyReport, id),
        fetchParsed(ctx, buildPath("getExplanation", { settlementId: id }), Explanation, id),
      ]);
      if ("problem" in window) return [window.problem];
      if ("problem" in report) return [report.problem];
      if ("problem" in explanation) return [explanation.problem];

      const problems = windowProblems(id + " · window", window.value);
      if (window.value.settlementId !== id) {
        problems.push(
          id + " · window: the window endpoint answered for " + window.value.settlementId,
        );
      }
      problems.push(...reportProblems(id, report.value, window.value, explanation.value));
      return problems;
    } catch (e) {
      /* A check never throws. An unexpected failure is itself a problem string. */
      return ["report: the check itself failed — " + describe(e)];
    }
  },
};
