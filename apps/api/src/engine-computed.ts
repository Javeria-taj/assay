import {
  Ceiling,
  DiscrepancyReport,
  DisputeWindow,
  Explanation,
  Forecast,
  Policy,
  SettlementSummary,
} from "@assay/contract";
import { COMMITTED_POLICY } from "./domain/committed-policy.js";
import type { RawCycle } from "./domain/raw-cycle.js";
import { analyseCeiling } from "./engine/ceiling.js";
import { calculate } from "./engine/calculate.js";
import { forecastOpenCycle } from "./engine/forecast.js";
import { buildReport } from "./engine/report.js";
import { buildDisputeWindow } from "./engine/window.js";
import type { SettlementSource } from "./sources/source.js";
import { memo } from "./store.js";

/**
 * The engine, assembled over a source.
 *
 * Every function it calls is pure and already on disk. This file adds exactly
 * three things and nothing else:
 *
 *  1. **Resolution.** `SettlementSource.getCycle` is keyed by the accounting
 *     period (`cyc_…`); every contract route is keyed by the settlement
 *     (`stl_…`). The two ids are deliberately not derivable from one another —
 *     the frozen schemas enforce mutually exclusive prefixes — so the mapping
 *     is a lookup over `listCycles()`, not a string transform.
 *  2. **Memoisation**, for the two answers that are pure functions of a cycle:
 *     the explanation and the ceiling. Both are deterministic given the same
 *     cycle and the same policy, so caching them changes latency and nothing
 *     else.
 *  3. **Clock injection.** `now` is a parameter on every clock-dependent
 *     answer and a parameter on nothing else. That is what makes the first two
 *     safe: the window, the report and the forecast move with the clock and are
 *     therefore never cached, and the explanation and the ceiling do not and
 *     therefore always can be.
 *
 * What it deliberately does NOT do is compute. There is no arithmetic in this
 * file. If a number is wrong, it is wrong in `engine/**`, and this file will
 * not have quietly patched it on the way past.
 */

export interface Engine {
  readonly kind: SettlementSource["kind"];

  /** Every settlement the source can explain, newest first. */
  listSummaries(now: number): Promise<SettlementSummary[]>;
  /** `null` when the id names no settlement this source knows. */
  summary(settlementId: string, now: number): Promise<SettlementSummary | null>;
  explanation(settlementId: string): Promise<Explanation | null>;
  ceiling(settlementId: string): Promise<Ceiling | null>;
  window(settlementId: string, now: number): Promise<DisputeWindow | null>;
  report(settlementId: string, now: number): Promise<DiscrepancyReport | null>;
  /** The open cycle, run forward. Not keyed by settlement: there is one. */
  forecast(now: number): Promise<Forecast>;
  /** The approved rate card every rupee above was computed from. */
  policy(): Policy;
}

/**
 * Binds the engine to one source for the life of the process.
 *
 * Every answer below is `parse`d against the frozen schema on the way out,
 * exactly as `/v1/health` already is. The API holds itself to the same contract
 * the web app validates with, so drift surfaces here — as our 500, naming the
 * field — rather than three layers away as a rendering bug.
 */
export function createEngine(source: SettlementSource): Engine {
  /** Namespaced per source kind so a live and a synthetic engine never share a cell. */
  const cell = (name: string): string => source.kind + ":" + name;

  async function cycleOf(settlementId: string): Promise<RawCycle | null> {
    const refs = await source.listCycles();
    const ref = refs.find((r) => r.id === settlementId);
    if (!ref) return null;
    return await source.getCycle(ref.cycleId);
  }

  /**
   * The cycle `/v1/forecast/current` projects forward.
   *
   * An open cycle if the source has one — a forecast is a statement about money
   * that has not landed. Every synthetic cycle is sealed (`status: "settled"`)
   * today, so the fallback is the most recently settled one, and the projection
   * is then a replay of a cycle that has already landed: `expectedSettlementAt`
   * sits in the past, which is visible in the payload rather than hidden by it.
   * The moment a source emits a pending cycle this route picks it up with no
   * change here.
   */
  async function cycleToProject(): Promise<RawCycle | null> {
    const refs = [...(await source.listCycles())].sort((a, b) => b.settledAt - a.settledAt);
    const cycles: RawCycle[] = [];
    for (const ref of refs) {
      const cycle = await source.getCycle(ref.cycleId);
      if (cycle) cycles.push(cycle);
    }
    return cycles.find((c) => c.status === "pending") ?? cycles[0] ?? null;
  }

  function explanationOf(cycle: RawCycle): Explanation {
    return memo(cell("explanation"), cycle.id, () =>
      Explanation.parse(calculate(cycle, COMMITTED_POLICY)),
    );
  }

  function ceilingOf(cycle: RawCycle): Ceiling {
    return memo(cell("ceiling"), cycle.id, () =>
      Ceiling.parse(analyseCeiling(explanationOf(cycle))),
    );
  }

  function windowOf(cycle: RawCycle, now: number): DisputeWindow {
    return DisputeWindow.parse(buildDisputeWindow(cycle.settledAt, now, cycle.id));
  }

  /**
   * Assembled from the three answers rather than recomputed, so a summary can
   * never disagree with the detail page it links to. In particular
   * `windowStatus` comes from `buildDisputeWindow` — the same function
   * `/v1/settlements/:id/window` serves — instead of a second three-day rule
   * living here. Two rules would agree on Meera and diverge on the first cycle
   * whose deadline straddles the closing threshold.
   */
  function summaryOf(cycle: RawCycle, now: number): SettlementSummary {
    const e = explanationOf(cycle);
    const c = ceilingOf(cycle);
    const w = windowOf(cycle, now);
    return SettlementSummary.parse({
      id: e.settlementId,
      cycleId: e.cycleId,
      cycleLabel: e.cycleLabel,
      settledAt: e.settledAt,
      grossCaptured: e.grossCaptured,
      netCredited: e.netCredited,
      merchantExpected: e.merchantExpected,
      unexplainedGap: e.unexplainedGap,
      windowStatus: w.status,
      basisUnverifiableShare: c.basisUnverifiable.share,
    });
  }

  return {
    kind: source.kind,

    async listSummaries(now) {
      const refs = await source.listCycles();
      const ordered = [...refs].sort((a, b) => b.settledAt - a.settledAt);
      const summaries: SettlementSummary[] = [];
      for (const ref of ordered) {
        const cycle = await source.getCycle(ref.cycleId);
        /* A ref the source can list but not fetch is a source bug, not a
         * merchant-facing one. Listing it with invented figures would be worse
         * than listing one settlement fewer. */
        if (cycle) summaries.push(summaryOf(cycle, now));
      }
      return summaries;
    },

    async summary(settlementId, now) {
      const cycle = await cycleOf(settlementId);
      return cycle && summaryOf(cycle, now);
    },

    async explanation(settlementId) {
      const cycle = await cycleOf(settlementId);
      return cycle && explanationOf(cycle);
    },

    async ceiling(settlementId) {
      const cycle = await cycleOf(settlementId);
      return cycle && ceilingOf(cycle);
    },

    async window(settlementId, now) {
      const cycle = await cycleOf(settlementId);
      return cycle && windowOf(cycle, now);
    },

    async report(settlementId, now) {
      const cycle = await cycleOf(settlementId);
      if (!cycle) return null;
      return DiscrepancyReport.parse(
        buildReport(explanationOf(cycle), windowOf(cycle, now), now),
      );
    },

    async forecast(now) {
      const cycle = await cycleToProject();
      if (!cycle) {
        throw new Error("forecast: the source lists no cycle to project forward from");
      }
      return Forecast.parse(forecastOpenCycle(cycle, COMMITTED_POLICY, now));
    },

    policy() {
      return Policy.parse(COMMITTED_POLICY);
    },
  };
}
