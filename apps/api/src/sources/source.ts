import type { CycleRef, RawCycle } from "../domain/raw-cycle.js";

/**
 * Where a cycle comes from. Two implementations: a live rail, and the
 * synthetic generator.
 *
 * The interface is shaped by what Assay needs, not by what any rail returns.
 * That is the whole point of the boundary — an unfamiliar upstream shape stops
 * here and never reaches the calculator or the contract.
 */
export interface SettlementSource {
  readonly kind: "live" | "synthetic";
  listCycles(): Promise<CycleRef[]>;
  getCycle(id: string): Promise<RawCycle | null>;
}

/** Thrown at startup, never mid-request. A misconfigured source must not boot. */
export class SourceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceConfigError";
  }
}
