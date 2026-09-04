/**
 * The fee policy: what the model parsed out of a rate card or a T&C, and what
 * a human then approved.
 *
 * Two rules are structural here rather than conventional, because a rule you
 * can forget is not a rule:
 *
 *   1. `read_from_api` lines have no rate field to hold a rate. §4.1 says
 *      rupees come from what the rail returned rather than from a number we
 *      typed in, and the union makes typing one in impossible.
 *   2. The calculator accepts `ApprovedFeePolicy` only. An unapproved policy
 *      cannot compute a rupee because it will not compile, not because
 *      somebody remembered to check a flag.
 */

/** A rate in basis points. 200 = 2%. Integer, never a float percentage. */
export type Bps = number;

/** Integer paise. Never a float, never rupees. */
export type Paise = number;

/* ------------------------------------------------------------- approval */

export type PendingApproval = {
  status: "pending_approval";
  approvedBy: null;
  approvedAt: null;
};

export type GrantedApproval = {
  status: "approved";
  approvedBy: string;
  /** Epoch milliseconds. */
  approvedAt: number;
};

/**
 * Discriminated so that `approval.approvedBy` is a `string` — not
 * `string | null` — everywhere an approved line is in hand.
 */
export type Approval = PendingApproval | GrantedApproval;

export const pending = (): PendingApproval => ({
  status: "pending_approval",
  approvedBy: null,
  approvedAt: null,
});

/* ------------------------------------------------------------ the bases */

/**
 * What an ad-valorem rate is applied to. Named, not free text, so the
 * calculator cannot be handed a base it does not know how to compute.
 */
export type FeeBase =
  /** Every captured rupee in the cycle. */
  | "gross_captured"
  /** The gross of one instrument slice — the per-rail split she cannot see. */
  | "instrument_slice_gross"
  /** The amount actually settled. */
  | "settled_amount";

/** What a per-unit charge is counted over. */
export type CountedEvent =
  | "failed_payment_attempt"
  | "chargeback"
  | "refund"
  | "captured_payment";

/* -------------------------------------------------------------- the lines */

type LineCommon = {
  id: string;
  label: string;
  /** Human-readable scope, e.g. "every captured payment". Rendered, not parsed. */
  appliesTo: string;
  /** Verbatim text of the rule. The drawer renders this. */
  quote: string;
  url: string | null;
  /** The model produced this line. Always. Assay does not hand-write policy. */
  parsedBy: "model";
  /** documented = traceable to a published source. constructed = our scenario. */
  provenance: "documented" | "constructed";
  approval: Approval;
};

/** A rate applied to a named base. */
export type AdValoremLine = LineCommon & {
  rule: "ad_valorem";
  rateBps: Bps;
  base: FeeBase;
};

/** A flat amount charged per counted event. */
export type FixedPerUnitLine = LineCommon & {
  rule: "fixed_per_unit";
  unitAmount: Paise;
  countedEvent: CountedEvent;
};

/**
 * Statutory tax on the sum of named fee lines.
 *
 * `taxableLineIds` is not optional and not a convenience. "The sum of the fee
 * lines" reads unambiguous and is not: taxing the gateway fee alone gives
 * ₹4,320, taxing every fee line gives ₹5,094, and the canonical figure is the
 * former. Naming the lines is the difference between two implementers agreeing
 * and the waterfall being wrong by ₹774.
 */
export type TaxOnFeesLine = LineCommon & {
  rule: "tax_on_fees";
  rateBps: Bps;
  /** Ids of the policy lines this tax applies to. Never inferred. */
  taxableLineIds: string[];
};

/**
 * The §4.1 line. It carries a field path and deliberately nothing else —
 * there is no `rateBps` on this variant to put a stale rate into.
 */
export type ReadFromApiLine = LineCommon & {
  rule: "read_from_api";
  /** e.g. "settlement.fees + settlement.tax". Read, never computed. */
  readFromApi: string;
};

/**
 * Declaratory. Computes nothing; it exists so the interface can say that a
 * rail carries zero network MDR by statute while the plan still charges for it.
 */
export type ZeroMdrStatuteLine = LineCommon & {
  rule: "zero_mdr_statute";
  /** e.g. "PSSA §10A". */
  statute: string;
};

export type FeePolicyLine =
  | AdValoremLine
  | FixedPerUnitLine
  | TaxOnFeesLine
  | ReadFromApiLine
  | ZeroMdrStatuteLine;

/** A line that computes money. `zero_mdr_statute` is not one. */
export type ComputingRule = Exclude<FeePolicyLine["rule"], "zero_mdr_statute">;

export const computesMoney = (line: FeePolicyLine): boolean => line.rule !== "zero_mdr_statute";

/* ------------------------------------------------------------- the policy */

export type SourceDocument = {
  title: string;
  url: string | null;
};

export type FeePolicy = {
  id: string;
  version: string;
  label: string;
  sourceDocuments: SourceDocument[];
  lines: FeePolicyLine[];
  status: "pending_approval" | "approved";
};

/** A line a human has signed off. `approvedBy` is a string here, not a maybe. */
export type ApprovedFeePolicyLine = FeePolicyLine & { approval: GrantedApproval };

/**
 * The only thing the calculator will accept. There is no way to construct one
 * except through `approve`, and no way to widen a `FeePolicy` into one without
 * the guard below narrowing it.
 */
export type ApprovedFeePolicy = FeePolicy & {
  status: "approved";
  lines: ApprovedFeePolicyLine[];
};

/**
 * The whole policy is approved only when every line in it is. A policy with
 * one pending line computes nothing at all — partial approval is not a state
 * Assay recognises.
 */
export function isApproved(policy: FeePolicy): policy is ApprovedFeePolicy {
  return (
    policy.status === "approved" &&
    policy.lines.length > 0 &&
    policy.lines.every((l) => l.approval.status === "approved")
  );
}

/* --------------------------------------------------------------- the store */

export class PolicyNotFoundError extends Error {
  constructor(id: string) {
    super("No policy " + id + ".");
    this.name = "PolicyNotFoundError";
  }
}

export interface PolicyStore {
  /** The policy currently in force or under review. Null before the first put. */
  get(): FeePolicy | null;
  /** Records a model-parsed policy. It computes nothing until approved. */
  putCandidate(policy: FeePolicy): void;
  /** Signs off every line and the policy. Throws if the id is unknown. */
  approve(id: string, by: string): ApprovedFeePolicy;
}

/**
 * In-memory. Assay holds one policy at a time and a restart re-parses; there
 * is deliberately no database in this system.
 */
export class InMemoryPolicyStore implements PolicyStore {
  readonly #byId = new Map<string, FeePolicy>();
  #currentId: string | null = null;
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  get(): FeePolicy | null {
    if (!this.#currentId) return null;
    return this.#byId.get(this.#currentId) ?? null;
  }

  putCandidate(policy: FeePolicy): void {
    this.#byId.set(policy.id, policy);
    this.#currentId = policy.id;
  }

  approve(id: string, by: string): ApprovedFeePolicy {
    const policy = this.#byId.get(id);
    if (!policy) throw new PolicyNotFoundError(id);

    const approvedAt = this.#now();
    const approved: FeePolicy = {
      ...policy,
      status: "approved",
      lines: policy.lines.map((line) => ({
        ...line,
        approval: { status: "approved", approvedBy: by, approvedAt },
      })),
    };

    this.#byId.set(id, approved);
    this.#currentId = id;

    /* Narrow rather than cast: if the shape were wrong, this throws here
     * instead of letting an unapproved line reach the calculator. */
    if (!isApproved(approved)) {
      throw new Error("Policy " + id + " did not satisfy isApproved after approval.");
    }
    return approved;
  }
}
