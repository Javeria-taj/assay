import type { InvariantCheck } from "./index.js";

/**
 * the same ceiling identities over every settlement in the list.
 *
 * Owned by WS-3 ceiling. This is the stub the seam ships so `pnpm verify`
 * compiles and the check appears in the table from minute one; returning no
 * problems here means "not yet implemented", not "passed".
 */
export const crossCycleCheck: InvariantCheck = {
  name: "cross-cycle",
  async run() {
    return [];
  },
};
