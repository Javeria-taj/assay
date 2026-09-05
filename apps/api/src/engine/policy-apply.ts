import { bps, type Paise, type Policy, type PolicyLine } from "@assay/contract";
import type { RawSettlementFacts } from "../domain/raw-cycle.js";

/* ============================================================================
 * AGGREGATION LEVEL — decided 17:45, do not relitigate
 *
 * At what level of aggregation does each policy line apply? Every rupee in the
 * waterfall turns on the answer, because rounding does not distribute:
 * `Σ bps(x_i, r)` is not `bps(Σ x_i, r)` in general. Five slices each rounding
 * half away from zero can land a paisa or two off the aggregate, and a paisa is
 * the difference between a waterfall that closes and a refusal.
 *
 *   P-01, the gateway fee — PER INSTRUMENT SLICE.
 *     The cycle's gateway fee is DEFINED as `Σ slice.feeCharged`. It is not
 *     defined as one bps() call on the cycle gross. This makes "the instrument
 *     mix decomposes the fee exactly" structural rather than lucky: it holds
 *     for any future mix, including one where the per-slice rounding does not
 *     cancel. That the two happen to agree for Meera — because every slice
 *     gross is a whole number of rupees, so nothing rounds at all — is asserted
 *     as a TEST and never used as a definition.
 *
 *   P-02, GST — ON THE CYCLE-AGGREGATE FEE.
 *     Exactly one bps() call, on the summed gateway fee. Per-slice GST summed
 *     would round differently and would not reproduce the canonical figure.
 *     This is the opposite choice from P-01 and it is deliberate: the tax is
 *     levied on the fee as one amount, and the fee as one amount is what the
 *     merchant is billed.
 *
 *   P-03 and P-04, per-event charges — INTEGER `count × unitAmount`.
 *     Never a rate. Never a bps() call. A per-event charge that goes through a
 *     rate is a per-event charge that can round, and these cannot.
 *
 *   P-05, the on-demand settlement fee — READ, NOT COMPUTED.
 *     `facts.feesPaise + facts.taxPaise`, straight off the rail's own response.
 *     `onDemandFee` asserts at runtime that P-05 holds no rate and that its
 *     readFromApi expression is the one this engine knows how to honour. There
 *     is no on-demand rate anywhere in this codebase and there must not be one:
 *     a rate we typed in is a rate that can go stale on camera.
 *
 *   Refund principal and chargeback principal — OFF THE RAW COLLECTIONS.
 *     Policy has no line for either. They are sums of what happened, not
 *     applications of a rule, and reaching for a policy line to produce them
 *     would invent a rule nobody approved.
 *
 * This module is the only thing in the calculator stream that touches a Policy,
 * and it owns no arithmetic of its own: every rupee goes through `bps()` from
 * `@assay/contract` or through integer multiplication of a count by an approved
 * fixed amount.
 * ==========================================================================*/

/** Policy line ids, named once so no call site spells one wrong. */
const GATEWAY_FEE_LINE = "P-01";
const GST_LINE = "P-02";
const ON_DEMAND_SETTLEMENT_LINE = "P-05";

/**
 * The expression P-05 must carry. Not a rate — a field path. If a future policy
 * says something else, this engine refuses rather than guessing which fields it
 * meant.
 */
const ON_DEMAND_EXPRESSION = "settlement.fees + settlement.tax";

/**
 * Raised when a policy line reaches the engine without a human's approval.
 *
 * A refusal, not a result. The route layer maps `code` onto the contract's
 * `policy_not_approved`.
 */
export class PolicyNotApprovedError extends Error {
  readonly code = "policy_not_approved";
  constructor(readonly lineId: string) {
    super(
      "Policy line " +
        lineId +
        " has not been approved by a human. Assay does not compute a rupee from an unapproved rule.",
    );
    this.name = "PolicyNotApprovedError";
  }
}

export interface AppliedPolicy {
  readonly policy: Policy;
  /** Throws PolicyNotApprovedError if the line's approved !== true. */
  line(id: string): PolicyLine;
  /** bps rate. Throws if rateBps is null. */
  rate(id: string): number;
  /** fixed amount in paise. Throws if fixedAmount is null. */
  fixed(id: string): Paise;
  /** the readFromApi expression. Throws if null, or if rateBps is not null. */
  readFromApi(id: string): string;
}

/**
 * Validates every line up front — before a single rupee is computed — then
 * hands back typed accessors.
 *
 * The up-front sweep is the point. Checking approval lazily, at the moment each
 * line is first read, means an unapproved line buried at P-06 lets P-01 through
 * P-05 compute real money first; the refusal then arrives after the arithmetic
 * rather than instead of it.
 */
export function applyPolicy(policy: Policy): AppliedPolicy {
  for (const l of policy.lines) {
    if (l.approved !== true) throw new PolicyNotApprovedError(l.id);
  }

  const byId = new Map<string, PolicyLine>(policy.lines.map((l) => [l.id, l]));

  const line = (id: string): PolicyLine => {
    const l = byId.get(id);
    if (!l) throw new Error("Policy " + policy.id + " has no line " + id + ".");
    if (l.approved !== true) throw new PolicyNotApprovedError(id);
    return l;
  };

  const rate = (id: string): number => {
    const l = line(id);
    if (l.rateBps === null) {
      throw new Error("Policy line " + id + " holds no rate; it cannot be read as one.");
    }
    return l.rateBps;
  };

  const fixed = (id: string): Paise => {
    const l = line(id);
    if (l.fixedAmount === null) {
      throw new Error("Policy line " + id + " holds no fixed amount; it cannot be read as one.");
    }
    return l.fixedAmount;
  };

  const readFromApi = (id: string): string => {
    const l = line(id);
    if (l.rateBps !== null) {
      throw new Error(
        "Policy line " + id + " carries a rate. A read-from-API line must not hold one.",
      );
    }
    if (l.readFromApi === null) {
      throw new Error("Policy line " + id + " names no API field to read.");
    }
    return l.readFromApi;
  };

  return { policy, line, rate, fixed, readFromApi };
}

/* ------------------------------------------------------------- the helpers */

/** P-01, applied at the slice. See the aggregation note above. */
export function gatewayFeeForSlice(grossPaise: Paise, p: AppliedPolicy): Paise {
  return bps(grossPaise, p.rate(GATEWAY_FEE_LINE));
}

/** P-02, applied once to the cycle-aggregate fee. */
export function taxOnFees(totalFeePaise: Paise, p: AppliedPolicy): Paise {
  return bps(totalFeePaise, p.rate(GST_LINE));
}

/** P-03 and P-04. Integer count times an approved fixed amount, never a rate. */
export function perEventFee(count: number, lineId: string, p: AppliedPolicy): Paise {
  return count * p.fixed(lineId);
}

/**
 * P-05. Read off the rail's own settlement object.
 *
 * The two assertions below are the §4.1 guard rail in executable form: if the
 * approved policy ever grows a rate for this line, or names a different pair of
 * fields, we stop instead of quietly computing from something nobody approved.
 */
export function onDemandFee(facts: RawSettlementFacts, p: AppliedPolicy): Paise {
  const expression = p.readFromApi(ON_DEMAND_SETTLEMENT_LINE);
  if (expression !== ON_DEMAND_EXPRESSION) {
    throw new Error(
      "Policy line " +
        ON_DEMAND_SETTLEMENT_LINE +
        ' reads "' +
        expression +
        '", which this engine does not know how to honour. Expected "' +
        ON_DEMAND_EXPRESSION +
        '".',
    );
  }
  return facts.feesPaise + facts.taxPaise;
}
