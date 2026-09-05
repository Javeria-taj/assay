import type { InvariantCheck } from "./index.js";

/**
 * both axes sum to totalDelta and the missing fields partition it.
 *
 * Owned by WS-3 ceiling. This is the stub the seam ships so `pnpm verify`
 * compiles and the check appears in the table from minute one; returning no
 * problems here means "not yet implemented", not "passed".
 */
export const ceilingCheck: InvariantCheck = {
  name: "ceiling",
  async run() {
    return [];
  },
};
