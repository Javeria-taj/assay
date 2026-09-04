import { bps, rupees, share, type Paise } from "./money.js";
import type {
  Ceiling,
  Citation,
  DiscrepancyReport,
  DisputeWindow,
  Explanation,
  ExplanationLine,
  Forecast,
  InstrumentSlice,
  Policy,
  SettlementSummary,
} from "./contract.js";

/* ============================================================================
 * The Meera fixture — HANDOFF §3.4, to the rupee.
 *
 * PROVENANCE, and this is not decoration:
 *   documented  — every RULE below traces to a published source (statute, T&C,
 *                 or a rail response field).
 *   constructed — Meera, her volumes, her instrument mix and her plan. Chosen
 *                 to show scale at a believable Indian SMB. She is not real and
 *                 the README, the UI and the video all say so.
 *
 * The arithmetic is correct. The scenario is built. Both statements ship.
 * ==========================================================================*/

const T = (iso: string) => Date.parse(iso);

export const FIXTURE_SETTLED_AT = T("2026-09-03T05:30:00.000Z"); // 11:00 IST
export const DISPUTE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
export const CLOSING_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const APPROVED_AT = T("2026-09-04T04:15:00.000Z");
const APPROVED_BY = "javeria.taj";

/* --------------------------------------------------------------- citations */

const cite = (c: Partial<Citation> & Pick<Citation, "kind" | "label" | "sourceId" | "title">): Citation => ({
  quote: null,
  url: null,
  approvedAt: c.kind === "policy_line" ? APPROVED_AT : null,
  approvedBy: c.kind === "policy_line" ? APPROVED_BY : null,
  ...c,
});

export const CITATIONS = {
  planFee: cite({
    kind: "policy_line",
    label: "policy P-01",
    sourceId: "P-01",
    title: "Gateway fee — flat plan, all instruments",
    quote: "A flat 2.00% of the captured amount, applied uniformly to every payment instrument.",
  }),
  gst: cite({
    kind: "policy_line",
    label: "policy P-02",
    sourceId: "P-02",
    title: "GST at 18% on payment-gateway fees",
    quote: "Goods and Services Tax at 18% is levied on the gateway fee, not on the transaction value.",
  }),
  failedFee: cite({
    kind: "policy_line",
    label: "policy P-03",
    sourceId: "P-03",
    title: "Failed-payment charge, per attempt",
    quote: "A fixed charge of ₹3 per failed authorisation attempt.",
  }),
  chargebackFee: cite({
    kind: "policy_line",
    label: "policy P-04",
    sourceId: "P-04",
    title: "Chargeback handling fee, per dispute",
    quote: "A fixed fee of ₹500 for each dispute raised against a captured payment.",
  }),
  instantSettlementApi: cite({
    kind: "api_field",
    label: "API · fees + tax",
    sourceId: "settlement.fees, settlement.tax",
    title: "On-demand settlement fee, read from the rail's own response",
    quote:
      "Read verbatim from the settlement object's fees and tax fields. Assay does not hold a rate for this line: §4.1 — rupees come from what the rail returned, never from a rate table we typed in.",
  }),
  refundsApi: cite({
    kind: "api_field",
    label: "API · refunds",
    sourceId: "refund.amount",
    title: "Refund principal, summed from the refunds collection",
  }),
  chargebackApi: cite({
    kind: "api_field",
    label: "API · disputes",
    sourceId: "dispute.amount",
    title: "Chargeback principal, summed from the disputes collection",
  }),
  capturedApi: cite({
    kind: "api_field",
    label: "API · payments",
    sourceId: "payment.amount",
    title: "Gross captured, summed over captured payments in the cycle",
  }),
  derivedNet: cite({
    kind: "derived",
    label: "derived",
    sourceId: "waterfall.sum",
    title: "Net credited — the signed sum of every line above, in deterministic code",
  }),
  zeroMdrStatute: cite({
    kind: "statute",
    label: "PSSA §10A",
    sourceId: "PSSA-10A",
    title: "Payment and Settlement Systems Act §10A — no charge on prescribed electronic modes",
    quote:
      "No bank or system provider shall impose any charge upon anyone, either directly or indirectly, for using the electronic modes of payment prescribed under section 269SU of the Income-tax Act, 1961.",
    url: "https://razorpay.com/terms/",
  }),
  s269su: cite({
    kind: "statute",
    label: "IT Act §269SU",
    sourceId: "IT-269SU",
    title: "Income-tax Act §269SU — prescribed electronic modes (UPI, RuPay debit)",
    url: "https://razorpay.com/terms/",
  }),
  threeDayClause: cite({
    kind: "statute",
    label: "T&C Part B",
    sourceId: "TNC-PART-B-DISCREPANCY",
    title: "Discrepancy reporting window",
    quote:
      "In case of discrepancies, You shall report to Razorpay PA regarding such discrepancy within three (3) days upon the receipt of the fund settlements.",
    url: "https://razorpay.com/terms/",
  }),
  upiCollapse: cite({
    kind: "derived",
    label: "field missing",
    sourceId: "FIELD-instrument_subtype",
    title: 'Three UPI rails with different statutory MDR, all reported as "UPI"',
  }),
  binTier: cite({
    kind: "derived",
    label: "field missing",
    sourceId: "FIELD-card_bin_tier",
    title: "Card BIN tier is not present in merchant-facing reports",
  }),
  feeBasis: cite({
    kind: "derived",
    label: "field missing",
    sourceId: "FIELD-per_line_fee_basis",
    title: "Per-line fee basis is not present in merchant-facing reports",
  }),
} satisfies Record<string, Citation>;

/* ------------------------------------------------------------- the numbers */

export const GROSS_CAPTURED: Paise = rupees(1_200_000);
export const HEADLINE_BPS = 200; // flat 2%
export const GATEWAY_FEE: Paise = bps(GROSS_CAPTURED, HEADLINE_BPS); // 24,00,000 p
export const REFUND_PRINCIPAL: Paise = rupees(32_000);
export const GST_ON_FEES: Paise = bps(GATEWAY_FEE, 1800); // 18% of the fee

export const FAILED_COUNT = 1_100;
export const FAILED_UNIT: Paise = rupees(3);
export const FAILED_FEES: Paise = FAILED_COUNT * FAILED_UNIT;

export const CHARGEBACK_COUNT = 2;
export const CHARGEBACK_UNIT_PRINCIPAL: Paise = rupees(2_700);
export const CHARGEBACK_PRINCIPAL: Paise = CHARGEBACK_COUNT * CHARGEBACK_UNIT_PRINCIPAL;
export const CHARGEBACK_UNIT_FEE: Paise = rupees(500);
export const CHARGEBACK_FEES: Paise = CHARGEBACK_COUNT * CHARGEBACK_UNIT_FEE;

/** §4.1 — these two come off the rail's response, not off a rate card. */
export const INSTANT_SETTLEMENT_BASE: Paise = rupees(300_000);
export const INSTANT_API_FEES: Paise = rupees(900);
export const INSTANT_API_TAX: Paise = rupees(162);
export const INSTANT_SETTLEMENT_TOTAL: Paise = INSTANT_API_FEES + INSTANT_API_TAX;

export const NET_CREDITED: Paise =
  GROSS_CAPTURED -
  GATEWAY_FEE -
  REFUND_PRINCIPAL -
  GST_ON_FEES -
  FAILED_FEES -
  CHARGEBACK_PRINCIPAL -
  CHARGEBACK_FEES -
  INSTANT_SETTLEMENT_TOTAL;

/** Her mental model: gross, minus the headline rate, minus what she refunded. */
export const MERCHANT_EXPECTED: Paise = GROSS_CAPTURED - GATEWAY_FEE - REFUND_PRINCIPAL;
export const UNEXPLAINED_GAP: Paise = MERCHANT_EXPECTED - NET_CREDITED;
export const TOTAL_DELTA: Paise = GROSS_CAPTURED - NET_CREDITED;

/* --------------------------------------------------------- instrument mix */

export const INSTRUMENT_MIX: InstrumentSlice[] = [
  {
    instrument: "upi_bank_account",
    displayLabel: "UPI — bank account",
    reportedAs: "UPI",
    grossCaptured: rupees(720_000),
    paymentCount: 640,
    networkMdrBps: 0,
    feeCharged: bps(rupees(720_000), HEADLINE_BPS),
    collapsedInReport: true,
    citation: CITATIONS.zeroMdrStatute,
  },
  {
    instrument: "upi_rupay_credit",
    displayLabel: "UPI — RuPay credit card",
    reportedAs: "UPI",
    grossCaptured: rupees(120_000),
    paymentCount: 85,
    networkMdrBps: 200,
    feeCharged: bps(rupees(120_000), HEADLINE_BPS),
    collapsedInReport: true,
    citation: CITATIONS.upiCollapse,
  },
  {
    instrument: "upi_ppi",
    displayLabel: "UPI — wallet / PPI",
    reportedAs: "UPI",
    grossCaptured: rupees(60_000),
    paymentCount: 55,
    networkMdrBps: 110,
    feeCharged: bps(rupees(60_000), HEADLINE_BPS),
    collapsedInReport: true,
    citation: CITATIONS.upiCollapse,
  },
  {
    instrument: "card_credit",
    displayLabel: "Cards",
    reportedAs: "Card",
    grossCaptured: rupees(240_000),
    paymentCount: 145,
    networkMdrBps: 180,
    feeCharged: bps(rupees(240_000), HEADLINE_BPS),
    collapsedInReport: true,
    citation: CITATIONS.binTier,
  },
  {
    instrument: "netbanking",
    displayLabel: "Netbanking",
    reportedAs: "Netbanking",
    grossCaptured: rupees(60_000),
    paymentCount: 35,
    networkMdrBps: 0,
    feeCharged: bps(rupees(60_000), HEADLINE_BPS),
    collapsedInReport: false,
    citation: CITATIONS.feeBasis,
  },
];

/* ---------------------------------------------------------------- the lines */

function line(l: Omit<ExplanationLine, "runningBalance">): Omit<ExplanationLine, "runningBalance"> {
  return l;
}

const RAW_LINES: Array<Omit<ExplanationLine, "runningBalance">> = [
  line({
    id: "L-00",
    kind: "gross_captured",
    label: "Gross captured",
    amount: GROSS_CAPTURED,
    count: 960,
    unitAmount: null,
    basis: {
      formula: "sum(payment.amount) over payments captured in the cycle",
      inputs: [{ label: "Captured payments", value: "960" }],
      computedBy: "deterministic",
    },
    citation: CITATIONS.capturedApi,
    onMerchantReport: true,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
  line({
    id: "L-01",
    kind: "gateway_fee",
    label: "Gateway fee at 2%",
    amount: -GATEWAY_FEE,
    count: null,
    unitAmount: null,
    basis: {
      formula: "2.00% × gross captured",
      inputs: [
        { label: "Gross captured", value: "₹12,00,000.00" },
        { label: "Plan rate", value: "200 bps, flat, all instruments" },
      ],
      computedBy: "deterministic",
    },
    citation: CITATIONS.planFee,
    onMerchantReport: true,
    amountReconciled: true,
    // The whole finding, on one line.
    basisVerifiable: false,
    unverifiableReason:
      'The total is checkable; its composition is not. This fee is levied across five rails carrying different statutory MDR, and three of them are reported to you identically as "UPI". Nothing you are given lets you check which rupee sat on which rail.',
  }),
  line({
    id: "L-02",
    kind: "refund_principal",
    label: "Refunds issued (principal)",
    amount: -REFUND_PRINCIPAL,
    count: 41,
    unitAmount: null,
    basis: {
      formula: "sum(refund.amount) over refunds settled in the cycle",
      inputs: [{ label: "Refunds settled", value: "41" }],
      computedBy: "deterministic",
    },
    citation: CITATIONS.refundsApi,
    onMerchantReport: true,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
  line({
    id: "L-03",
    kind: "tax_on_fees",
    label: "GST at 18% on the fee",
    amount: -GST_ON_FEES,
    count: null,
    unitAmount: null,
    basis: {
      formula: "18% × gateway fee",
      inputs: [
        { label: "Gateway fee", value: "₹24,000.00" },
        { label: "GST rate", value: "18%" },
      ],
      computedBy: "deterministic",
    },
    citation: CITATIONS.gst,
    onMerchantReport: true,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
  line({
    id: "L-04",
    kind: "failed_payment_fee",
    label: "Failed-payment charges",
    amount: -FAILED_FEES,
    count: FAILED_COUNT,
    unitAmount: FAILED_UNIT,
    basis: {
      formula: "1,100 failed attempts × ₹3",
      inputs: [
        { label: "Failed authorisation attempts", value: "1,100" },
        { label: "Charge per attempt", value: "₹3.00" },
      ],
      computedBy: "deterministic",
    },
    citation: CITATIONS.failedFee,
    onMerchantReport: false,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
  line({
    id: "L-05",
    kind: "chargeback_principal",
    label: "Chargebacks (principal)",
    amount: -CHARGEBACK_PRINCIPAL,
    count: CHARGEBACK_COUNT,
    unitAmount: CHARGEBACK_UNIT_PRINCIPAL,
    basis: {
      formula: "2 disputes × ₹2,700",
      inputs: [{ label: "Disputes raised", value: "2" }],
      computedBy: "deterministic",
    },
    citation: CITATIONS.chargebackApi,
    onMerchantReport: true,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
  line({
    id: "L-06",
    kind: "chargeback_fee",
    label: "Chargeback fees",
    amount: -CHARGEBACK_FEES,
    count: CHARGEBACK_COUNT,
    unitAmount: CHARGEBACK_UNIT_FEE,
    basis: {
      formula: "2 disputes × ₹500",
      inputs: [{ label: "Disputes raised", value: "2" }],
      computedBy: "deterministic",
    },
    citation: CITATIONS.chargebackFee,
    onMerchantReport: false,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
  line({
    id: "L-07",
    kind: "instant_settlement_fee",
    label: "On-demand settlement fee",
    amount: -INSTANT_SETTLEMENT_TOTAL,
    count: null,
    unitAmount: null,
    basis: {
      formula: "settlement.fees + settlement.tax, read from the rail's response",
      inputs: [
        { label: "Amount settled on demand", value: "₹3,00,000.00" },
        { label: "settlement.fees", value: "₹900.00" },
        { label: "settlement.tax", value: "₹162.00" },
      ],
      computedBy: "deterministic",
    },
    citation: CITATIONS.instantSettlementApi,
    onMerchantReport: false,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
  line({
    id: "L-08",
    kind: "net_credited",
    label: "Actually credited",
    amount: 0,
    count: null,
    unitAmount: null,
    basis: {
      formula: "signed sum of every line above",
      inputs: [{ label: "Lines", value: "8" }],
      computedBy: "deterministic",
    },
    citation: CITATIONS.derivedNet,
    onMerchantReport: true,
    amountReconciled: true,
    basisVerifiable: true,
    unverifiableReason: null,
  }),
];

/** Running balance is computed, never typed. The last line IS the net. */
export const EXPLANATION_LINES: ExplanationLine[] = (() => {
  let bal = 0;
  return RAW_LINES.map((l) => {
    if (l.kind !== "net_credited") bal += l.amount;
    return { ...l, runningBalance: bal };
  });
})();

/* ------------------------------------------------------------- assemblies */

export const SETTLEMENT_ID = "stl_2608mera01";
export const CYCLE_ID = "cyc_202608";
export const POLICY_ID = "pol_flat2pc01";

export const EXPLANATION: Explanation = {
  settlementId: SETTLEMENT_ID,
  cycleId: CYCLE_ID,
  cycleLabel: "August 2026",
  periodStart: T("2026-07-31T18:30:00.000Z"),
  periodEnd: T("2026-08-31T18:29:59.999Z"),
  settledAt: FIXTURE_SETTLED_AT,
  merchant: {
    id: "mer_meera01",
    name: "Meera",
    segment: "D2C skincare, ₹12L/month",
    plan: { label: "Flat 2% — all instruments", headlineBps: HEADLINE_BPS, citation: CITATIONS.planFee },
    constructed: true,
  },
  grossCaptured: GROSS_CAPTURED,
  netCredited: NET_CREDITED,
  merchantExpected: MERCHANT_EXPECTED,
  expectationBasis: "gross − 2% − refunds",
  unexplainedGap: UNEXPLAINED_GAP,
  lines: EXPLANATION_LINES,
  instrumentMix: INSTRUMENT_MIX,
  reconciliation: { ok: true, computedNet: NET_CREDITED, statedNet: NET_CREDITED, delta: 0 },
  policyId: POLICY_ID,
};

const ZERO_MDR_GROSS = rupees(720_000);
const ZERO_MDR_FEE = bps(ZERO_MDR_GROSS, HEADLINE_BPS);
const BASIS_UNVERIFIABLE = GATEWAY_FEE;
const BASIS_VERIFIABLE = TOTAL_DELTA - BASIS_UNVERIFIABLE;

export const CEILING: Ceiling = {
  settlementId: SETTLEMENT_ID,
  totalDelta: TOTAL_DELTA,
  amountReconciled: { amount: TOTAL_DELTA, share: 1 },
  amountUnreconciled: { amount: 0, share: 0 },
  basisVerifiable: { amount: BASIS_VERIFIABLE, share: share(BASIS_VERIFIABLE, TOTAL_DELTA) },
  basisUnverifiable: { amount: BASIS_UNVERIFIABLE, share: share(BASIS_UNVERIFIABLE, TOTAL_DELTA) },
  headline: "Every rupee reconciles. ₹24,000 of it — 33.8% — you have no way to check.",
  method:
    "Two deterministic passes over the settlement's own lines. The first asserts each amount against the rail's figures. The second asks whether the rule behind that amount is derivable from the fields present in the merchant's own reports. No model runs in either pass; the model's only job was parsing the rate card into the policy a human then approved.",
  missingFields: [
    {
      id: "instrument_subtype",
      name: "Instrument sub-type",
      whyItMatters:
        "Bank-account UPI carries 0% network MDR by statute, RuPay-credit-on-UPI around 2%, and PPI-on-UPI 1.1% above ₹2,000. The rail knows which is which — `payment.upi.payer_account_type` carries exactly those three values. The settlement recon report does not: it carries `method`, which reads \"UPI\" for all three. Recovering the distinction means joining all 960 settled rows back to their payments, one call each.",
      wouldResolve: rupees(18_000),
      citation: CITATIONS.upiCollapse,
    },
    {
      id: "card_bin_tier",
      name: "Card BIN tier",
      whyItMatters:
        "Debit, credit, commercial and international BINs carry materially different interchange, and the tier is not surfaced on the merchant's report — so the card slice of the fee cannot be checked against any published rate.",
      wouldResolve: rupees(4_800),
      citation: CITATIONS.binTier,
    },
    {
      id: "per_line_fee_basis",
      name: "Per-line fee basis",
      whyItMatters:
        "Each fee line states an amount but not the base it was computed on, so a merchant cannot distinguish an ad-valorem charge from a flat per-transaction one, or verify either.",
      wouldResolve: rupees(1_200),
      citation: CITATIONS.feeBasis,
    },
  ],
  zeroMdrExposure: {
    grossOnZeroMdrRails: ZERO_MDR_GROSS,
    feeLeviedOnZeroMdrRails: ZERO_MDR_FEE,
    annualisedFee: ZERO_MDR_FEE * 12,
    note:
      "₹7,20,000 of this cycle moved on a rail that carries zero network MDR by statute — UPI from a bank account. Under a flat 2% plan that slice still attracted ₹14,400 of fee. This is legal, disclosed in the plan, and invisible on the report: nothing Meera is given tells her the slice exists. Counted here only for rails where zero MDR is mandated by statute (UPI from a bank account, RuPay debit) — netbanking is excluded, as it carries a flat per-transaction bank charge rather than an ad-valorem MDR.",
    citations: [CITATIONS.zeroMdrStatute, CITATIONS.s269su],
  },
};

export const SUMMARY: SettlementSummary = {
  id: SETTLEMENT_ID,
  cycleId: CYCLE_ID,
  cycleLabel: "August 2026",
  settledAt: FIXTURE_SETTLED_AT,
  grossCaptured: GROSS_CAPTURED,
  netCredited: NET_CREDITED,
  merchantExpected: MERCHANT_EXPECTED,
  unexplainedGap: UNEXPLAINED_GAP,
  windowStatus: "open",
  basisUnverifiableShare: CEILING.basisUnverifiable.share,
};

export function buildWindow(settledAt: number, now: number): DisputeWindow {
  const deadlineAt = settledAt + DISPUTE_WINDOW_MS;
  const msRemaining = deadlineAt - now;
  const status = msRemaining <= 0 ? "expired" : msRemaining <= CLOSING_THRESHOLD_MS ? "closing" : "open";
  return {
    settlementId: SETTLEMENT_ID,
    settledAt,
    deadlineAt,
    serverNow: now,
    msRemaining,
    status,
    closingThresholdMs: CLOSING_THRESHOLD_MS,
    clause: CITATIONS.threeDayClause,
  };
}

export function buildReport(settledAt: number, now: number): DiscrepancyReport {
  const w = buildWindow(settledAt, now);
  return {
    settlementId: SETTLEMENT_ID,
    generatedAt: now,
    window: w,
    subject: "Settlement discrepancy — August 2026 cycle (" + SETTLEMENT_ID + ")",
    body: [
      "Reporting a discrepancy on the settlement received for the August 2026 cycle,",
      "within the three-day window set out in the terms.",
      "",
      "Amount credited: ₹11,28,918.00",
      "Amount expected on the stated plan (gross − 2% − refunds): ₹11,44,000.00",
      "Difference: ₹15,082.00",
      "",
      "The following lines account for the difference. Each is reconciled against",
      "the figures returned for this settlement:",
      "",
      "  GST at 18% on the gateway fee            ₹4,320.00",
      "  Failed-payment charges, 1,100 × ₹3       ₹3,300.00",
      "  Chargebacks, 2 × ₹2,700 principal        ₹5,400.00",
      "  Chargeback fees, 2 × ₹500                ₹1,000.00",
      "  On-demand settlement fee                 ₹1,062.00",
      "",
      "Three of these five lines are not itemised anywhere in the reports available",
      "to me, which is why the difference was not identified at the time of credit.",
      "",
      "Separately, and not disputed here: ₹24,000.00 of gateway fee was charged",
      "across five rails carrying different statutory network MDR, three of which",
      'are reported identically as "UPI". I am unable to verify the composition of',
      "that fee from any field made available to me, and would ask that the",
      "instrument sub-type and per-line fee basis be included in future reports.",
      "",
      "Requesting confirmation of the five lines above within the reporting window.",
    ].join("\n"),
    claims: [
      { lineId: "L-03", statement: "GST at 18% on the gateway fee", amount: GST_ON_FEES, citation: CITATIONS.gst },
      { lineId: "L-04", statement: "Failed-payment charges, 1,100 × ₹3", amount: FAILED_FEES, citation: CITATIONS.failedFee },
      { lineId: "L-05", statement: "Chargebacks, 2 × ₹2,700 principal", amount: CHARGEBACK_PRINCIPAL, citation: CITATIONS.chargebackApi },
      { lineId: "L-06", statement: "Chargeback fees, 2 × ₹500", amount: CHARGEBACK_FEES, citation: CITATIONS.chargebackFee },
      { lineId: "L-07", statement: "On-demand settlement fee", amount: INSTANT_SETTLEMENT_TOTAL, citation: CITATIONS.instantSettlementApi },
    ],
    disputedTotal: UNEXPLAINED_GAP,
  };
}

/* ---------------------------------------------------------------- forecast */

const F_CAPTURED = rupees(410_000);
const F_FEE = bps(F_CAPTURED, HEADLINE_BPS);
const F_REFUNDS = rupees(9_000);
const F_GST = bps(F_FEE, 1800);
const F_FAILED = 380 * FAILED_UNIT;
const F_NET = F_CAPTURED - F_FEE - F_REFUNDS - F_GST - F_FAILED;

export function buildForecast(now: number): Forecast {
  let bal = 0;
  const mk = (
    id: string,
    kind: ExplanationLine["kind"],
    label: string,
    amount: number,
    formula: string,
    citation: Citation,
  ): ExplanationLine => {
    if (kind !== "net_credited") bal += amount;
    return {
      id,
      kind,
      label,
      amount,
      runningBalance: bal,
      count: null,
      unitAmount: null,
      basis: { formula, inputs: [], computedBy: "deterministic" },
      citation,
      onMerchantReport: false,
      amountReconciled: false,
      basisVerifiable: kind !== "gateway_fee",
      unverifiableReason: kind === "gateway_fee" ? "Composition unverifiable, as in the settled cycle." : null,
    };
  };
  return {
    cycleId: "cyc_202609",
    asOf: now,
    expectedSettlementAt: T("2026-10-03T05:30:00.000Z"),
    capturedSoFar: F_CAPTURED,
    projectedNet: F_NET,
    projectedLines: [
      mk("F-00", "gross_captured", "Captured so far", F_CAPTURED, "sum(payment.amount), cycle to date", CITATIONS.capturedApi),
      mk("F-01", "gateway_fee", "Gateway fee at 2%", -F_FEE, "2.00% × captured to date", CITATIONS.planFee),
      mk("F-02", "refund_principal", "Refunds issued", -F_REFUNDS, "sum(refund.amount), cycle to date", CITATIONS.refundsApi),
      mk("F-03", "tax_on_fees", "GST at 18% on the fee", -F_GST, "18% × gateway fee", CITATIONS.gst),
      mk("F-04", "failed_payment_fee", "Failed-payment charges", -F_FAILED, "380 failed attempts × ₹3", CITATIONS.failedFee),
      mk("F-05", "net_credited", "Projected credit", 0, "signed sum of every line above", CITATIONS.derivedNet),
    ],
    backtest: {
      method: "policy_engine_replay",
      cycles: 0,
      medianAbsError: 0,
      maxAbsError: 0,
      note:
        "Not yet backtested. The synthetic generator (J-B4) has not been run against this policy. The UI must render this as 'accuracy not yet measured' — never as zero error.",
    },
  };
}

/* ------------------------------------------------------------------ policy */

export const POLICY: Policy = {
  id: POLICY_ID,
  version: "2026-09-04.1",
  label: "Flat 2% merchant plan — constructed scenario",
  sourceDocuments: [
    { title: "Razorpay Terms & Conditions", url: "https://razorpay.com/terms/" },
    { title: "Payment and Settlement Systems Act, §10A", url: null },
    { title: "Income-tax Act, §269SU", url: null },
    { title: "Merchant pricing plan (constructed for this scenario)", url: null },
  ],
  approvedBy: APPROVED_BY,
  approvedAt: APPROVED_AT,
  lines: [
    {
      id: "P-01",
      label: "Gateway fee — flat plan",
      appliesTo: "every captured payment, all instruments",
      rateBps: 200,
      fixedAmount: null,
      readFromApi: null,
      quote: "A flat 2.00% of the captured amount, applied uniformly to every payment instrument.",
      url: null,
      parsedBy: "model",
      approved: true,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
      provenance: "constructed",
    },
    {
      id: "P-02",
      label: "GST on fees",
      appliesTo: "all gateway fees",
      rateBps: 1800,
      fixedAmount: null,
      readFromApi: null,
      quote: "Goods and Services Tax at 18% is levied on the gateway fee, not on the transaction value.",
      url: null,
      parsedBy: "model",
      approved: true,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
      provenance: "documented",
    },
    {
      id: "P-03",
      label: "Failed-payment charge",
      appliesTo: "each failed authorisation attempt",
      rateBps: null,
      fixedAmount: rupees(3),
      readFromApi: null,
      quote: "A fixed charge of ₹3 per failed authorisation attempt.",
      url: null,
      parsedBy: "model",
      approved: true,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
      provenance: "constructed",
    },
    {
      id: "P-04",
      label: "Chargeback handling fee",
      appliesTo: "each dispute raised",
      rateBps: null,
      fixedAmount: rupees(500),
      readFromApi: null,
      quote: "A fixed fee of ₹500 for each dispute raised against a captured payment.",
      url: null,
      parsedBy: "model",
      approved: true,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
      provenance: "constructed",
    },
    {
      id: "P-05",
      label: "On-demand settlement fee",
      appliesTo: "each on-demand settlement",
      rateBps: null,
      fixedAmount: null,
      readFromApi: "settlement.fees + settlement.tax",
      quote:
        "No rate is held for this line. The fee and its tax are read from the settlement object returned by the rail. §4.1: a rate we typed in is a rate that can go stale on camera.",
      url: null,
      parsedBy: "model",
      approved: true,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
      provenance: "documented",
    },
    {
      id: "P-06",
      label: "Zero network MDR — prescribed electronic modes",
      appliesTo: "UPI from a bank account, RuPay debit",
      rateBps: 0,
      fixedAmount: null,
      readFromApi: null,
      quote:
        "No bank or system provider shall impose any charge upon anyone, either directly or indirectly, for using the electronic modes of payment prescribed under section 269SU of the Income-tax Act, 1961.",
      url: "https://razorpay.com/terms/",
      parsedBy: "model",
      approved: true,
      approvedBy: APPROVED_BY,
      approvedAt: APPROVED_AT,
      provenance: "documented",
    },
  ],
};
