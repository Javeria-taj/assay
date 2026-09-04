import type { CeilingResult } from "../domain/ceiling.js";
import type { ComputedSettlement } from "../domain/computed.js";
import type { DisputeWindowData } from "../domain/dispute-window.js";
import type { ForecastData } from "../domain/forecast.js";
import type { ApprovedFeePolicy } from "../domain/policy.js";
import type { RawCycle } from "../domain/raw-cycle.js";
import type { DiscrepancyReportData } from "../domain/report.js";

/**
 * The seam. Four streams build against these signatures concurrently, and the
 * signatures are what let them do that without waiting on each other.
 *
 * Every function here throws until its stream lands. A stream implements its
 * own port and touches no other.
 *
 * Note what `computeSettlement` accepts. It is `ApprovedFeePolicy`, not
 * `FeePolicy`, so "an unapproved policy cannot compute a rupee" is a
 * compile-time fact rather than a runtime check somebody has to remember. See
 * the proof at the bottom of this file.
 */

const owned = (stream: string): never => {
  throw new Error(stream + " owns this");
};

/** Deterministic from `seed`: the same seed produces the same cycles, always. */
export function generateCycles(seed: number, count: number): RawCycle[] {
  void seed;
  void count;
  return owned("the generator stream");
}

/**
 * The calculator. Refuses to return a settlement whose reconciliation delta is
 * non-zero — see `computedSettlement` in domain/computed.ts.
 */
export function computeSettlement(cycle: RawCycle, policy: ApprovedFeePolicy): ComputedSettlement {
  void cycle;
  void policy;
  return owned("the calculator stream");
}

export function analyseCeiling(
  settlement: ComputedSettlement,
  cycle: RawCycle,
  policy: ApprovedFeePolicy,
): CeilingResult {
  void settlement;
  void cycle;
  void policy;
  return owned("the ceiling stream");
}

export function buildDisputeWindow(settledAt: number, now: number): DisputeWindowData {
  void settledAt;
  void now;
  return owned("the report stream");
}

export function buildReport(
  settlement: ComputedSettlement,
  window: DisputeWindowData,
): DiscrepancyReportData {
  void settlement;
  void window;
  return owned("the report stream");
}

export function forecastOpenCycle(cycle: RawCycle, policy: ApprovedFeePolicy): ForecastData {
  void cycle;
  void policy;
  return owned("the forecast stream");
}

/* ---------------------------------------------------------------------------
 * Proof of acceptance 4: a pending policy is a compile-time error, not a
 * runtime one. Uncomment these three lines and `pnpm typecheck` fails with
 *
 *   error TS2345: Argument of type 'FeePolicy' is not assignable to
 *   parameter of type 'ApprovedFeePolicy'.
 *
 * which is the guarantee this seam is built to give. Verified 2026-09-04.
 *
 *   declare const pendingPolicy: import("../domain/policy.js").FeePolicy;
 *   declare const someCycle: RawCycle;
 *   void computeSettlement(someCycle, pendingPolicy);
 *
 * The narrowing route is `isApproved(policy)`, or `PolicyStore.approve()`,
 * which returns an `ApprovedFeePolicy` and is the only constructor of one.
 * ------------------------------------------------------------------------- */
