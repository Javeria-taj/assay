import type { CycleRef, RawCycle } from "../domain/raw-cycle.js";
import type { SettlementSource } from "./source.js";

/**
 * The synthetic generator. Batch 3 fills this in; until then it refuses
 * loudly rather than returning something plausible and empty.
 */
export class SyntheticSettlementSource implements SettlementSource {
  readonly kind = "synthetic" as const;

  async listCycles(): Promise<CycleRef[]> {
    throw new Error("synthetic source lands in Batch 3");
  }

  async getCycle(_id: string): Promise<RawCycle | null> {
    throw new Error("synthetic source lands in Batch 3");
  }
}
