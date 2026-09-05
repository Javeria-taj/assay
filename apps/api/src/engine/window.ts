import {
  CITATIONS,
  CLOSING_THRESHOLD_MS,
  DISPUTE_WINDOW_MS,
  type DisputeWindow,
} from "@assay/contract";

/**
 * The three-day clause, as a value.
 *
 * SIGNATURE DECISION, settled before dispatch so two streams cannot disagree:
 * the brief said `(settledAt, now)`, but `DisputeWindow` requires a
 * `settlementId` and a `clause`, and neither is derivable from two numbers.
 * The clause turned out to be a constant — `CITATIONS.threeDayClause` — so only
 * the id was genuinely missing, and it is added as a third parameter. That is
 * the smallest widening that makes the return type constructible.
 *
 * Reference implementation to match: `F.buildWindow(settledAt, now)` in
 * `packages/contract/src/fixtures.ts`.
 *
 * Pure: no clock of its own. `now` is passed in, because a countdown the server
 * computes and a countdown the client guesses are two different numbers and
 * only one of them is telling her whether a contractual right is still hers.
 * Every field below is server-computed for exactly that reason.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Three days, and the threshold under which the window reads "closing", are
 * imported from `@assay/contract` rather than retyped here.
 *
 * They are the numbers the shipped fixture, the mock server and the UI already
 * agree on. A second definition would be a second place for the deadline to be
 * wrong, and a deadline wrong by an hour is worse than one that is absent.
 *
 * 3, derived rather than typed, so the prose and the arithmetic cannot drift.
 */
export const DISPUTE_WINDOW_DAYS = DISPUTE_WINDOW_MS / MS_PER_DAY;

/**
 * `open` → `closing` → `expired`, on the remaining milliseconds alone.
 *
 * The boundaries are deliberate and both are checked in the test: at exactly
 * `closingThresholdMs` remaining the window already reads "closing", and at
 * exactly 0 it already reads "expired". A window that says "open" on the
 * instant the right lapses is the one failure this status cannot have.
 */
export function windowStatus(msRemaining: number): DisputeWindow["status"] {
  if (msRemaining <= 0) return "expired";
  if (msRemaining <= CLOSING_THRESHOLD_MS) return "closing";
  return "open";
}

export function buildDisputeWindow(
  settledAt: number,
  now: number,
  settlementId: string,
): DisputeWindow {
  const deadlineAt = settledAt + DISPUTE_WINDOW_MS;
  const msRemaining = deadlineAt - now;
  return {
    settlementId,
    settledAt,
    deadlineAt,
    serverNow: now,
    msRemaining,
    status: windowStatus(msRemaining),
    closingThresholdMs: CLOSING_THRESHOLD_MS,
    /* The citation object itself, never a reconstructed copy of it. A retyped
     * quote differs from the shipped one by a character nobody can see. */
    clause: CITATIONS.threeDayClause,
  };
}
