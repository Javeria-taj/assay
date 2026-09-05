import {
  CITATIONS,
  type Citation,
  type Instrument,
  type InstrumentSlice,
} from "@assay/contract";
import { attributionOf } from "../domain/attribution.js";
import { NETWORK_MDR_BPS } from "../domain/instrument.js";
import type { RawCycle } from "../domain/raw-cycle.js";
import { gatewayFeeForSlice, type AppliedPolicy } from "./policy-apply.js";

/**
 * Projects the cycle's payments into the per-rail split the merchant is never
 * shown.
 *
 * Emission order is fixed — the rails in the order the product talks about
 * them, UPI sub-types first — and an instrument with no payments in the cycle
 * emits no slice at all. A zero-gross slice would render as a row on her
 * screen claiming a rail she did not use.
 */
export const INSTRUMENT_ORDER: readonly Instrument[] = [
  "upi_bank_account",
  "upi_rupay_credit",
  "upi_ppi",
  "card_debit",
  "card_credit",
  "netbanking",
  "wallet",
];

/**
 * Per-rail display metadata, keyed on the INSTRUMENT and not on `reportedAs`.
 *
 * The asymmetry in the citations is the finding, not an oversight:
 * `upi_bank_account` cites the statute that says its network MDR is zero, while
 * its two siblings — reported to her under the identical word "UPI" — cite the
 * collapse that hides them. Keying this table on `reportedAs` would flatten
 * exactly the distinction the product exists to surface.
 *
 * `networkMdrBps` comes from the seam's `NETWORK_MDR_BPS` rather than being
 * retyped here, so there is one table of what the NETWORK charges and it cannot
 * drift from the one the ceiling reads.
 */
type SliceMeta = {
  displayLabel: string;
  /** What HER report calls it. Three rails share one word; that is the point. */
  reportedAs: string;
  citation: Citation;
};

const META: Readonly<Record<Instrument, SliceMeta>> = {
  upi_bank_account: {
    displayLabel: "UPI — bank account",
    reportedAs: "UPI",
    citation: CITATIONS.zeroMdrStatute,
  },
  upi_rupay_credit: {
    displayLabel: "UPI — RuPay credit card",
    reportedAs: "UPI",
    citation: CITATIONS.upiCollapse,
  },
  upi_ppi: {
    displayLabel: "UPI — wallet / PPI",
    reportedAs: "UPI",
    citation: CITATIONS.upiCollapse,
  },
  card_debit: { displayLabel: "Cards", reportedAs: "Card", citation: CITATIONS.binTier },
  card_credit: { displayLabel: "Cards", reportedAs: "Card", citation: CITATIONS.binTier },
  netbanking: {
    displayLabel: "Netbanking",
    reportedAs: "Netbanking",
    citation: CITATIONS.feeBasis,
  },
  wallet: { displayLabel: "Wallet", reportedAs: "Wallet", citation: CITATIONS.feeBasis },
};

/**
 * `networkMdrBps` IS DESCRIPTIVE METADATA. It is rendered, and it is read by the
 * ceiling stream; it never multiplies anything in this stream. No rupee in this
 * file is computed from it. What the merchant was actually charged comes from
 * her approved plan — `gatewayFeeForSlice` — and the whole product is the gap
 * between the two numbers, which only exists if they are computed separately.
 */
export function instrumentMix(cycle: RawCycle, p: AppliedPolicy): InstrumentSlice[] {
  const slices: InstrumentSlice[] = [];

  for (const instrument of INSTRUMENT_ORDER) {
    const rows = cycle.payments.filter((payment) => payment.instrument === instrument);
    if (rows.length === 0) continue;

    const meta = META[instrument];
    const grossCaptured = rows.reduce((a, payment) => a + payment.amountPaise, 0);

    /**
     * `collapsedInReport` is not "another slice here shares my label". Under
     * that rule `card_credit` — alone in tonight's mix — reads false, and the
     * BIN tier it hides is just as invisible to her as it would be if
     * card_debit had turned up. The collapse is a property of the LABEL hiding
     * a dimension that exists in the world, so it is derived from
     * `attributionOf`, which is the seam's shared mapping and is not
     * reimplemented here.
     */
    const draft = {
      instrument,
      displayLabel: meta.displayLabel,
      reportedAs: meta.reportedAs,
      grossCaptured,
      paymentCount: rows.length,
      networkMdrBps: NETWORK_MDR_BPS[instrument],
      feeCharged: gatewayFeeForSlice(grossCaptured, p),
      collapsedInReport: false,
      citation: meta.citation,
    };

    slices.push({ ...draft, collapsedInReport: attributionOf(draft) !== "per_line_fee_basis" });
  }

  return slices;
}
