import type { Instrument } from "./instrument.js";

/**
 * Which missing field would make a slice's fee checkable.
 *
 * Shared by the calculator (for `collapsedInReport`) and the ceiling (for the
 * `missingFields` partition), so it lives here and neither reimplements it.
 * Duplicating this mapping is how the two streams silently drift apart.
 */
export type MissingFieldId = "instrument_subtype" | "card_bin_tier" | "per_line_fee_basis";

/** The three ids in the order the ceiling emits them. Not sorted — emission order. */
export const MISSING_FIELD_ORDER: readonly MissingFieldId[] = [
  "instrument_subtype",
  "card_bin_tier",
  "per_line_fee_basis",
];

/**
 * Keys on `reportedAs` — the label the MERCHANT sees — and never on the
 * citation or the instrument.
 *
 * Grouping by `citation.sourceId` gives ₹3,600 for `instrument_subtype`,
 * because the bank-UPI slice cites the zero-MDR statute while its two siblings
 * cite the collapse; that silently drops ₹14,400. Grouping by `reportedAs`
 * gives ₹18,000 and the three fields then sum to ₹24,000 exactly.
 */
export function attributionOf(slice: { reportedAs: string }): MissingFieldId {
  switch (slice.reportedAs) {
    case "UPI":
      return "instrument_subtype";
    case "Card":
      return "card_bin_tier";
    default:
      return "per_line_fee_basis";
  }
}

/**
 * Rails where zero network MDR is mandated by statute — UPI from a bank
 * account (PSSA §10A, Income-tax Act §269SU) and RuPay debit.
 *
 * Never filter on `networkMdrBps === 0`. Netbanking also carries 0 and is NOT
 * statutory zero-MDR: it is a flat per-transaction bank charge rather than an
 * ad-valorem MDR. The numeric filter returns ₹15,600 against a fixture that
 * asserts ₹14,400.
 */
export function isStatutoryZeroMdr(instrument: Instrument): boolean {
  return instrument === "upi_bank_account";
}
