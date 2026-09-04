import type { ComputedLine } from "./computed.js";
import type { Paise } from "./policy.js";

/**
 * The open cycle, run through the same deterministic engine as a closed one.
 * Not a model, and it must never claim an accuracy it has not measured:
 * `cycles === 0` renders as "accuracy not yet measured", never as zero error.
 */
export type Backtest = {
  method: "policy_engine_replay";
  cycles: number;
  /**
   * Null when `cycles` is 0. Contract invariant 10: an unmeasured forecast
   * renders as "accuracy not yet measured" and never as zero error, so the
   * type refuses to carry a 0 that could be read as perfect.
   */
  medianAbsError: Paise | null;
  maxAbsError: Paise | null;
  note: string;
};

export type ForecastData = {
  cycleId: string;
  asOf: number;
  expectedSettlementAt: number;
  capturedSoFar: Paise;
  projectedNet: Paise;
  projectedLines: ComputedLine[];
  backtest: Backtest;
};
