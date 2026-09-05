import {
  CITATIONS,
  formatPaise,
  share,
  type Ceiling,
  type Citation,
  type Explanation,
  type ExplanationLine,
  type MissingField,
  type Paise,
} from "@assay/contract";
import {
  attributionOf,
  isStatutoryZeroMdr,
  MISSING_FIELD_ORDER,
  type MissingFieldId,
} from "../domain/attribution.js";
import { CEILING_METHOD, ceilingHeadline, MISSING_FIELD_COPY } from "../domain/copy.js";

/* ============================================================================
 * BUCKETING — decided 17:45, do not relitigate
 *
 * `totalDelta = e.grossCaptured − e.netCredited`. Never a sum of our own: the
 * delta is defined by the two endpoints the rail gave us, and a sum that
 * disagreed with them would be a reconciliation failure, not a smaller ceiling.
 *
 * The BUCKETABLE lines are every line whose `kind` is neither `gross_captured`
 * nor `net_credited`. Those two are the endpoints of the delta, not components
 * of it; including either would double-count the whole cycle.
 *
 * Each bucketable line contributes `−line.amount` to its bucket. That is a
 * NEGATION, not `Math.abs()`. Deductions are negative in the contract, so the
 * negation turns them into positive contributions; a positive `adjustment`
 * line correctly contributes a negative amount and SHRINKS its bucket, which
 * is what an adjustment is. `Math.abs()` would look identical on Meera and
 * would silently break the identity below the first time a generated cycle
 * carried a positive adjustment — and the generator is allowed to emit one.
 *
 * Because invariant 1 holds (the signed lines sum to `netCredited`),
 * `Σ(−amount)` over the bucketable set is IDENTICALLY `grossCaptured −
 * netCredited`. The four buckets therefore sum to `totalDelta` on both axes
 * structurally, not by luck.
 *
 * The two axes are independent and are never collapsed. A line can reconcile
 * to the paisa and still be entirely uncheckable — Meera's ₹24,000 gateway fee
 * is exactly that, and it is the product's finding, not a defect in it.
 *
 * `missingFields` is a PARTITION, not three assertions. Every slice lands in
 * exactly one group under `attributionOf`, and `Σ slice.feeCharged` IS the
 * gateway fee (invariant 4), so the groups sum to the gateway fee by
 * construction rather than by three hardcoded numbers that happen to add up.
 *
 * No rupee figure appears anywhere in this file. Every number is computed from
 * the Explanation's own line flags and instrument mix.
 * ==========================================================================*/

type Bucket = Ceiling["basisVerifiable"];

/** `share()` rounds to 4dp; the complement has to be rounded the same way. */
const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;

const sum = (xs: readonly number[]): Paise => xs.reduce((a, b) => a + b, 0);

const MONTHS_IN_YEAR = 12;

/** The two markers are the endpoints of the delta, never components of it. */
const isBucketable = (l: ExplanationLine): boolean =>
  l.kind !== "gross_captured" && l.kind !== "net_credited";

/** A negation, not an absolute value. See the header. */
const contribution = (l: ExplanationLine): Paise => -l.amount;

/**
 * Keyed on the missing-field id, not on the slice's own citation. A slice
 * cites whatever is most specific about it — bank UPI cites the statute — so
 * the citation is not the attribution. `attributionOf` owns that mapping.
 */
const CITATION_FOR: Readonly<Record<MissingFieldId, Citation>> = {
  instrument_subtype: CITATIONS.upiCollapse,
  card_bin_tier: CITATIONS.binTier,
  per_line_fee_basis: CITATIONS.feeBasis,
};

/** 200 -> "2%", 250 -> "2.5%". Trailing zeros dropped so the note reads as prose. */
const planPercent = (headlineBps: number): string =>
  String(Number((headlineBps / 100).toFixed(2))) + "%";

function missingField(id: MissingFieldId, wouldResolve: Paise): MissingField {
  const copy = MISSING_FIELD_COPY[id];
  return {
    id,
    name: copy.name,
    whyItMatters: copy.whyItMatters,
    wouldResolve,
    citation: CITATION_FOR[id],
  };
}

/**
 * The explainability ceiling for one settlement.
 *
 * Pure and synchronous: no HTTP, no env, no clock, no randomness, no I/O, no
 * memoisation. WS-5 makes it async and caches it behind `Engine.ceiling()`.
 */
export function analyseCeiling(e: Explanation): Ceiling {
  const totalDelta: Paise = e.grossCaptured - e.netCredited;
  const bucketable = e.lines.filter(isBucketable);

  /* --- the two axes ----------------------------------------------------
   * Sum the FALSE side and take the complement for the TRUE side, on both
   * axes. Two independent `share()` calls do not reliably sum to 1.0000:
   * `share()` rounds half away from zero, so a split landing on a 4dp
   * `.00005` boundary rounds BOTH halves up and the pair sums to 1.0001,
   * failing invariant 7 and the frozen `Share` bound. Meera's numbers dodge
   * it. Generated cycles do not. Deriving the complement makes the failure
   * mode impossible rather than unlikely.
   *
   * `totalDelta === 0` needs no special case: `share()` guards divide-by-zero
   * and returns 0, so the unverifiable share is 0, the verifiable share is 1,
   * both amounts are 0, and invariant 7 still holds. */

  const unreconciledPaise = sum(bucketable.filter((l) => !l.amountReconciled).map(contribution));
  const unverifiablePaise = sum(bucketable.filter((l) => !l.basisVerifiable).map(contribution));

  const amountUnreconciled: Bucket = {
    amount: unreconciledPaise,
    share: share(unreconciledPaise, totalDelta),
  };
  const amountReconciled: Bucket = {
    amount: totalDelta - unreconciledPaise,
    share: round4(1 - amountUnreconciled.share),
  };
  const basisUnverifiable: Bucket = {
    amount: unverifiablePaise,
    share: share(unverifiablePaise, totalDelta),
  };
  const basisVerifiable: Bucket = {
    amount: totalDelta - unverifiablePaise,
    share: round4(1 - basisUnverifiable.share),
  };

  /* --- missingFields: a partition of the instrument mix ------------------
   * Group the mix by `attributionOf(slice)` — which keys on `reportedAs`, the
   * label the MERCHANT sees — and sum `feeCharged` per group. Grouping by
   * `citation.sourceId` instead gives ₹3,600 for instrument_subtype and
   * silently drops the bank-UPI slice, because that slice cites the statute
   * rather than the collapse. */

  const feeByField = new Map<MissingFieldId, Paise>(MISSING_FIELD_ORDER.map((id) => [id, 0]));
  for (const slice of e.instrumentMix) {
    const id = attributionOf(slice);
    feeByField.set(id, (feeByField.get(id) ?? 0) + slice.feeCharged);
  }
  const feeAcrossFields = sum([...feeByField.values()]);

  /* Invariant 8 closed structurally. The slice partition covers the gateway-fee
   * line only. If some OTHER bucketable line is flagged unverifiable — a future
   * policy line, or a generated cycle — the two sums would diverge and
   * `Σ wouldResolve === basisUnverifiable.amount` would fail. So split the
   * unverifiable amount into the part the mix explains and the part it does
   * not, and give the remainder to `per_line_fee_basis`: a line whose basis she
   * cannot check IS a missing per-line fee basis, which is what that field
   * means. `unverifiableOther` is 0 for Meera and legitimately non-zero
   * elsewhere — it is never asserted to be 0. */
  const gatewayFeeContribution = sum(
    bucketable.filter((l) => !l.basisVerifiable && l.kind === "gateway_fee").map(contribution),
  );
  /* Clamped into `[0, basisUnverifiable]`. A positive `adjustment` line flagged
   * unverifiable contributes a NEGATIVE amount (see the header), which can make
   * the gateway fee's share of the unverifiable total exceed the total itself.
   * Unclamped, the remainder then goes negative, `per_line_fee_basis` is
   * dropped by the `> 0` filter below, and invariant 8 fails on a cycle nobody
   * has generated yet. Clamping keeps both parts non-negative and keeps them
   * summing to the total exactly. Meera clamps to herself: the gateway fee IS
   * the whole unverifiable amount, so this is the identity for the fixture. */
  const unverifiableFromGatewayFee = Math.min(Math.max(gatewayFeeContribution, 0), unverifiablePaise);
  const unverifiableOther = unverifiablePaise - unverifiableFromGatewayFee;

  /* Pro rata by the slice partition, allocated on the RUNNING total rather
   * than per group. Rounding each group independently can leave a residual
   * that drives a small group negative — and a negative `wouldResolve` is
   * dropped by the `> 0` filter below, which would break invariant 8 by one
   * paisa. Allocating cumulatively makes every group non-negative and makes
   * the residual land on the last id in emission order — `per_line_fee_basis`
   * — which is exactly where the brief puts it, without a second rounding
   * rule to keep in sync. For Meera the slice fees already sum to the gateway
   * fee, so every group takes its own sum unchanged and no rounding occurs. */
  const lastField = MISSING_FIELD_ORDER.at(-1);
  if (!lastField) throw new Error("analyseCeiling: MISSING_FIELD_ORDER is empty");

  const allocated = new Map<MissingFieldId, Paise>();
  let allocatedSoFar = 0;
  let feeSoFar = 0;
  for (const id of MISSING_FIELD_ORDER) {
    feeSoFar += feeByField.get(id) ?? 0;
    const cumulative =
      feeAcrossFields === 0
        ? 0
        : Math.round((unverifiableFromGatewayFee * feeSoFar) / feeAcrossFields);
    allocated.set(id, cumulative - allocatedSoFar);
    allocatedSoFar = cumulative;
  }
  allocated.set(
    lastField,
    (allocated.get(lastField) ?? 0) + (unverifiableFromGatewayFee - allocatedSoFar) + unverifiableOther,
  );

  /* Emission order is fixed and is NOT sorted — `assert.deepEqual` on an array
   * is order-sensitive, and the panel reads top to bottom. */
  const missingFields: MissingField[] = MISSING_FIELD_ORDER.map((id) =>
    missingField(id, allocated.get(id) ?? 0),
  ).filter((m) => m.wouldResolve > 0);

  /* A field with nothing behind it is not rendered — a cycle with no card
   * volume should not show an empty "Card BIN tier" row. But the frozen schema
   * is `z.array(MissingField).min(1)`, so a cycle with no gateway fee at all
   * still emits one row: `per_line_fee_basis` at zero, which is the honest
   * statement that nothing is unexplainable here. */
  if (missingFields.length === 0) missingFields.push(missingField(lastField, 0));

  /* --- zero-MDR exposure ------------------------------------------------
   * The filter is STATUTORY, not numeric. `isStatutoryZeroMdr` is the only
   * zero-MDR test in this file. Netbanking carries a zero network MDR too and
   * is not statutory zero-MDR — it is a flat per-transaction bank charge, not
   * an ad-valorem MDR — so a numeric filter returns ₹15,600 where the fixture
   * says ₹14,400, and the note's own last sentence says why. */
  const zeroMdrSlices = e.instrumentMix.filter((s) => isStatutoryZeroMdr(s.instrument));
  const grossOnZeroMdrRails = sum(zeroMdrSlices.map((s) => s.grossCaptured));
  const feeLeviedOnZeroMdrRails = sum(zeroMdrSlices.map((s) => s.feeCharged));

  /* Rendered from a template, never pasted, so it stays true for a generated
   * cycle: the two money figures, the plan rate and the merchant's name are
   * all substitutions. */
  const note =
    formatPaise(grossOnZeroMdrRails, { paise: false }) +
    " of this cycle moved on a rail that carries zero network MDR by statute — UPI from a bank account." +
    " Under a flat " +
    planPercent(e.merchant.plan.headlineBps) +
    " plan that slice still attracted " +
    formatPaise(feeLeviedOnZeroMdrRails, { paise: false }) +
    " of fee. This is legal, disclosed in the plan, and invisible on the report: nothing " +
    e.merchant.name +
    " is given tells her the slice exists. Counted here only for rails where zero MDR is mandated" +
    " by statute (UPI from a bank account, RuPay debit) — netbanking is excluded, as it carries a" +
    " flat per-transaction bank charge rather than an ad-valorem MDR.";

  const ceiling: Ceiling = {
    settlementId: e.settlementId,
    totalDelta,
    amountReconciled,
    amountUnreconciled,
    basisVerifiable,
    basisUnverifiable,
    missingFields,
    headline: ceilingHeadline(basisUnverifiable.amount, basisUnverifiable.share),
    method: CEILING_METHOD,
    zeroMdrExposure: {
      grossOnZeroMdrRails,
      feeLeviedOnZeroMdrRails,
      annualisedFee: feeLeviedOnZeroMdrRails * MONTHS_IN_YEAR,
      note,
      citations: [CITATIONS.zeroMdrStatute, CITATIONS.s269su],
    },
  };

  assertCeilingIsSound(ceiling);
  return ceiling;
}

/**
 * A failure here is a programming mistake in this file, not a
 * `reconciliation_failed` on the merchant's data — so it is a plain `Error`
 * naming the offending number, not a domain error the route layer maps.
 */
function assertCeilingIsSound(c: Ceiling): void {
  const { totalDelta } = c;

  if (totalDelta < 0) {
    throw new Error("analyseCeiling: totalDelta is negative (" + totalDelta + "p)");
  }

  const axisAmount = c.amountReconciled.amount + c.amountUnreconciled.amount;
  if (axisAmount !== totalDelta) {
    throw new Error(
      "analyseCeiling: reconciled axis sums to " + axisAmount + "p, not totalDelta " + totalDelta + "p",
    );
  }

  const axisBasis = c.basisVerifiable.amount + c.basisUnverifiable.amount;
  if (axisBasis !== totalDelta) {
    throw new Error(
      "analyseCeiling: basis axis sums to " + axisBasis + "p, not totalDelta " + totalDelta + "p",
    );
  }

  const buckets: ReadonlyArray<readonly [string, Bucket]> = [
    ["amountReconciled", c.amountReconciled],
    ["amountUnreconciled", c.amountUnreconciled],
    ["basisVerifiable", c.basisVerifiable],
    ["basisUnverifiable", c.basisUnverifiable],
  ];
  for (const [name, b] of buckets) {
    /* A negative bucket produces a `share` outside `Share`'s 0..1 and fails the
     * frozen schema at the route boundary — catch it here, where the message
     * can name which bucket. */
    if (b.amount < 0 || b.amount > totalDelta) {
      throw new Error(
        "analyseCeiling: " + name + " is " + b.amount + "p, outside [0, " + totalDelta + "]",
      );
    }
  }

  const resolved = c.missingFields.reduce((a, m) => a + m.wouldResolve, 0);
  if (resolved !== c.basisUnverifiable.amount) {
    throw new Error(
      "analyseCeiling: missingFields resolve " +
        resolved +
        "p but basisUnverifiable is " +
        c.basisUnverifiable.amount +
        "p",
    );
  }
}
