import type { InvariantCheck } from "./index.js";

/**
 * the signed waterfall closes and the mix decomposes the fee.
 *
 * Owned by WS-1 calculator. This is the stub the seam ships so `pnpm verify`
 * compiles and the check appears in the table from minute one; returning no
 * problems here means "not yet implemented", not "passed".
 */
export const waterfallCheck: InvariantCheck = {
  name: "waterfall",
  async run() {
    return [];
  },
};
