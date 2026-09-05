import { ApiProblem, refuse, reply, type AppContext } from "../envelope.js";
import { ReconcileError } from "../domain/lines.js";
import { PolicyNotApprovedError } from "../engine/policy-apply.js";

/**
 * The one place a route turns an engine outcome into an HTTP answer.
 *
 * There are exactly three outcomes and this file names all of them:
 *
 *   a value   200, wrapped by `envelope.ts`
 *   `null`    404 not_found — the id names nothing this source knows
 *   a refusal 409 — the engine declined to produce a number
 *
 * Anything else is rethrown, reaches `onError`, and becomes a 500 the caller
 * learns nothing from. That is deliberate: an unrecognised throw is our bug,
 * and dressing it as a domain error would teach the caller a lie.
 *
 * ## Why a refusal is never downgraded
 *
 * `ReconcileError` is raised when the signed lines do not sum to what the rail
 * says landed. The tempting handling — log it, drop the reconciliation block,
 * serve the lines anyway — is the single worst thing this product could do. A
 * merchant who disputes a charge on the strength of a waterfall that does not
 * close is worse off than one we showed nothing to: she has spent her one
 * three-day window on a number we could not stand behind. So the delta leaves
 * as a 409 carrying the two figures, and no payload is served at all.
 *
 * `PolicyNotApprovedError` is the same refusal one step earlier: a rule no
 * human signed off computed no rupee, so there is nothing to serve.
 */

/** `null` when the throw is not a domain refusal and must keep travelling. */
export function domainProblem(e: unknown): ApiProblem | null {
  if (e instanceof ReconcileError) {
    return new ApiProblem(409, "reconciliation_failed", e.message);
  }
  if (e instanceof PolicyNotApprovedError) {
    return new ApiProblem(409, "policy_not_approved", e.message, "policy.lines." + e.lineId);
  }
  return null;
}

/**
 * Runs `produce` and maps its outcome. `missing` is the 404 message, phrased
 * for a person: it names what was looked for, never what the lookup did.
 */
export async function answer<T>(
  c: AppContext,
  missing: string,
  produce: () => Promise<T | null>,
): Promise<Response> {
  let value: T | null;
  try {
    value = await produce();
  } catch (e) {
    const problem = domainProblem(e);
    if (!problem) throw e;
    return refuse(c, problem);
  }
  if (value === null) return refuse(c, new ApiProblem(404, "not_found", missing));
  return reply(c, value);
}
