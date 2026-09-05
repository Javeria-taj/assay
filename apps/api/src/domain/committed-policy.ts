import { POLICY } from "@assay/contract";
import type { Policy } from "@assay/contract";

/**
 * The policy the engine computes with.
 *
 * It is the contract fixture's own `POLICY`, re-exported rather than retyped.
 * There is exactly one definition of P-01 through P-06 in this repo, and a
 * second hand-typed copy would drift from it the first time a rate changed —
 * silently, and in the direction of a wrong rupee.
 *
 * Every line is `parsedBy: "model"` and `approved: true` with a named approver
 * and a timestamp, which is the precondition for computing anything at all.
 */
export const COMMITTED_POLICY: Policy = POLICY;
