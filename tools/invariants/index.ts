/**
 * Invariant checks that run over the WIRE, against a deployed API, via
 * `pnpm verify`. They check a payload, never an implementation, so the same
 * check catches a stale cache, a bad deploy and a broken mapper alike.
 *
 * A check returns `[]` for pass, or human-readable problem strings. It never
 * throws, never exits, and never prints — `tools/verify-contract.ts` owns the
 * table.
 */

export interface InvariantContext {
  base: string;
  token: string;
  settlementId: string;
  fetchJson(path: string): Promise<unknown>;
}

export interface InvariantCheck {
  name: string;
  run(ctx: InvariantContext): Promise<string[]>;
}

import { waterfallCheck } from "./waterfall.js";
import { ceilingCheck } from "./ceiling.js";
import { crossCycleCheck } from "./cross-cycle.js";
import { reportCheck } from "./report.js";

/** Registered here so a stream fills its own file and nothing else. */
export const checks: InvariantCheck[] = [waterfallCheck, ceilingCheck, crossCycleCheck, reportCheck];
