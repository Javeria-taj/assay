import type { ExplanationLine } from "@assay/contract";
import { formatPaise } from "@assay/contract";
import type { Paise } from "./policy.js";

/**
 * A waterfall line before its running balance is known. The calculator emits
 * these in order; `seal` computes the balances and decides whether the result
 * is fit to return at all.
 */
export type LineDraft = Omit<ExplanationLine, "runningBalance">;

/**
 * Raised when the signed lines do not sum to what the rail says landed.
 *
 * This is a refusal, not a result. Assay does not return an `Explanation`
 * carrying a non-zero delta: rendering a number that does not add up is the
 * one failure this product cannot survive, and a merchant acting on it would
 * be worse off than if we had shown her nothing.
 */
export class ReconcileError extends Error {
  readonly code = "reconciliation_failed";
  constructor(
    readonly computedNet: Paise,
    readonly statedNet: Paise,
  ) {
    super(
      "Waterfall does not reconcile: the lines sum to " +
        formatPaise(computedNet) +
        " but the rail says " +
        formatPaise(statedNet) +
        " landed, a difference of " +
        formatPaise(computedNet - statedNet) +
        ". Assay will not return a settlement it cannot stand behind.",
    );
    this.name = "ReconcileError";
  }
}

/**
 * Computes every running balance and proves the waterfall closes.
 *
 * The final line is the `net_credited` marker: its own `amount` stays 0 — it
 * is an endpoint of the delta, not a component of it — and its
 * `runningBalance` is the sum of everything above.
 */
export function seal(drafts: LineDraft[], statedNet: Paise): ExplanationLine[] {
  if (drafts.length < 2) throw new Error("seal: a waterfall needs at least a start and an end");

  const last = drafts[drafts.length - 1];
  if (!last || last.kind !== "net_credited") {
    throw new Error("seal: the final draft must be the net_credited marker, got " + last?.kind);
  }

  let running = 0;
  const sealed: ExplanationLine[] = drafts.map((d) => {
    running += d.amount;
    return { ...d, runningBalance: running };
  });

  const computedNet = running;
  if (computedNet !== statedNet) throw new ReconcileError(computedNet, statedNet);
  return sealed;
}
