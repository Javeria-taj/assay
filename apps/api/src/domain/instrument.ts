/**
 * The rails Assay distinguishes, and the reason it exists.
 *
 * These are Assay's own names. They happen to match the frozen contract's
 * `Instrument` union member for member — `to-contract.ts` asserts that at
 * compile time — but the domain owns this list so that nothing downstream of
 * the adapter has to import a schema to name a rail.
 *
 * The first three are the finding: bank-account UPI carries 0% network MDR by
 * statute, RuPay-credit-on-UPI around 2%, PPI-on-UPI 1.1% above ₹2,000. The
 * rail knows which is which. The settlement report says "UPI" for all three.
 */
export const INSTRUMENTS = [
  "upi_bank_account",
  "upi_rupay_credit",
  "upi_ppi",
  "card_debit",
  "card_credit",
  "netbanking",
  "wallet",
] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

/** Rails where zero network MDR is mandated by statute, not merely competitive. */
export const ZERO_MDR_BY_STATUTE: readonly Instrument[] = ["upi_bank_account"];

/**
 * Statutory / typical network MDR in basis points, by rail.
 *
 * This is reference data, not policy: it is what the network charges, not what
 * the merchant's plan charges her. The gap between the two is the product. It
 * lives here because no rail returns it and the calculator must not invent it.
 */
export const NETWORK_MDR_BPS: Readonly<Record<Instrument, number>> = {
  upi_bank_account: 0, // PSSA §10A, Income-tax Act §269SU
  upi_rupay_credit: 200,
  upi_ppi: 110, // above ₹2,000
  card_debit: 90,
  card_credit: 180,
  netbanking: 0, // flat per-transaction bank charge, not ad valorem
  wallet: 0,
};
