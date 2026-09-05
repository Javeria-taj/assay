import { formatPaise } from "@assay/contract";
import type { MissingFieldId } from "./attribution.js";
import type { Paise } from "./policy.js";

/**
 * Every merchant-facing sentence the engine emits, in one place.
 *
 * Nothing downstream writes a new sentence about fees. The tone rule is not
 * decorative: the product measures, it does not accuse. The gateway fee is
 * correct and uncheckable — never "missing" and never "hidden".
 */

/** Rendered, not pasted, so it stays true for a generated cycle. */
export function ceilingHeadline(unverifiablePaise: Paise, unverifiableShare: number): string {
  const pct = (unverifiableShare * 100).toFixed(1);
  return (
    "Every rupee reconciles. " +
    formatPaise(unverifiablePaise, { paise: false }) +
    " of it — " +
    pct +
    "% — you have no way to check."
  );
}

export const CEILING_METHOD =
  "Two deterministic passes over the settlement's own lines. The first asserts each amount against the rail's figures. The second asks whether the rule behind that amount is derivable from the fields present in the merchant's own reports. No model runs in either pass; the model's only job was parsing the rate card into the policy a human then approved.";

export const GATEWAY_FEE_UNVERIFIABLE_REASON =
  'The total is checkable; its composition is not. This fee is levied across five rails carrying different statutory MDR, and three of them are reported to you identically as "UPI". Nothing you are given lets you check which rupee sat on which rail.';

export const MISSING_FIELD_COPY: Readonly<Record<MissingFieldId, { name: string; whyItMatters: string }>> = {
  instrument_subtype: {
    name: "Instrument sub-type",
    whyItMatters:
      "Bank-account UPI carries 0% network MDR by statute, RuPay-credit-on-UPI around 2%, and PPI-on-UPI 1.1% above ₹2,000. The rail knows which is which — `payment.upi.payer_account_type` carries exactly those three values. The settlement recon report does not: it carries `method`, which reads \"UPI\" for all three. Recovering the distinction means joining all 960 settled rows back to their payments, one call each.",
  },
  card_bin_tier: {
    name: "Card BIN tier",
    whyItMatters:
      "Debit, credit, commercial and international BINs carry materially different interchange, and the tier is not surfaced on the merchant's report — so the card slice of the fee cannot be checked against any published rate.",
  },
  per_line_fee_basis: {
    name: "Per-line fee basis",
    whyItMatters:
      "Each fee line states an amount but not the base it was computed on, so a merchant cannot distinguish an ad-valorem charge from a flat per-transaction one, or verify either.",
  },
};
