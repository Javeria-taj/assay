import type {
  Ceiling,
  Citation as ContractCitation,
  DisputeWindow,
  DiscrepancyReport,
  Explanation,
  ExplanationLine,
  Forecast,
  Instrument as ContractInstrument,
  InstrumentSlice,
  LineKind as ContractLineKind,
  Policy,
  SettlementSummary,
} from "@assay/contract";
import type { CeilingResult } from "../domain/ceiling.js";
import type {
  Citation,
  ComputedInstrumentSlice,
  ComputedLine,
  ComputedSettlement,
  LineKind,
} from "../domain/computed.js";
import type { DisputeWindowData } from "../domain/dispute-window.js";
import type { ForecastData } from "../domain/forecast.js";
import type { FeePolicy } from "../domain/policy.js";
import type { Instrument } from "../domain/instrument.js";
import type { DiscrepancyReportData } from "../domain/report.js";

/**
 * The edge. Every piece of knowledge about the public contract lives in this
 * file and nowhere else, so the domain can be reshaped freely while the
 * contract stays frozen — and a contract change breaks exactly one file.
 *
 * No wave-1 stream imports `@assay/contract`. They import from `../domain/`
 * and let this module do the translating.
 */

/* ---------------------------------------------------------------------------
 * Compile-time agreement between the domain's unions and the contract's.
 *
 * These are types, not code: they cost nothing at runtime, and they fail the
 * build the moment the two lists drift apart. That is the whole reason the
 * domain is allowed to declare its own `Instrument` and `LineKind` without
 * importing a schema to do it.
 * ------------------------------------------------------------------------- */

type AssertTrue<T extends true> = T;
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Fails to compile if the domain and contract instrument unions diverge. */
export type InstrumentUnionsAgree = AssertTrue<MutuallyAssignable<Instrument, ContractInstrument>>;

/** Fails to compile if the domain and contract line-kind unions diverge. */
export type LineKindUnionsAgree = AssertTrue<MutuallyAssignable<LineKind, ContractLineKind>>;

/* ------------------------------------------------------------------ mappers */

const owned = (): never => {
  throw new Error("the contract-mapping stream owns this");
};

export function citationToContract(citation: Citation): ContractCitation {
  void citation;
  return owned();
}

export function lineToContract(line: ComputedLine): ExplanationLine {
  void line;
  return owned();
}

export function instrumentSliceToContract(slice: ComputedInstrumentSlice): InstrumentSlice {
  void slice;
  return owned();
}

export function settlementToExplanation(settlement: ComputedSettlement): Explanation {
  void settlement;
  return owned();
}

export function settlementToSummary(
  settlement: ComputedSettlement,
  ceiling: CeilingResult,
  window: DisputeWindowData,
): SettlementSummary {
  void settlement;
  void ceiling;
  void window;
  return owned();
}

export function ceilingToContract(ceiling: CeilingResult): Ceiling {
  void ceiling;
  return owned();
}

export function windowToContract(window: DisputeWindowData): DisputeWindow {
  void window;
  return owned();
}

export function reportToContract(report: DiscrepancyReportData): DiscrepancyReport {
  void report;
  return owned();
}

export function forecastToContract(forecast: ForecastData): Forecast {
  void forecast;
  return owned();
}

export function policyToContract(policy: FeePolicy): Policy {
  void policy;
  return owned();
}
