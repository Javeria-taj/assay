import { rupees } from "@assay/contract";
import type { Instrument } from "./instrument.js";
import { partition } from "./partition.js";
import type {
  RawCycle,
  RawDispute,
  RawFailedAttempt,
  RawMerchant,
  RawPayment,
  RawRefund,
} from "./raw-cycle.js";

/**
 * The canonical cycle. Every stream reproduces this one, and the frozen
 * fixture in `@assay/contract` is what it must agree with to the paisa.
 *
 * The aggregates are inputs, not outcomes. A naive draw of 960 plausible
 * payments will never land on exactly ₹12,00,000 split 640/85/55/145/35 across
 * five rails, so the slice totals are declared and `partition` splits each one
 * into parts that sum back exactly. The synthetic generator adds a seeded rng
 * to vary the shape; nothing else about the approach changes.
 *
 * `statedNetPaise` is what the rail says landed, and it is an INDEPENDENT
 * input. It is written here as arithmetic over the policy's own rules rather
 * than taken from the calculator, because if the calculator supplied it then
 * `reconciliation.delta === 0` would be a tautology instead of an assertion.
 */

/* ------------------------------------------------------------- identity */

export const MEERA_CYCLE_ID = "cyc_202608";
export const MEERA_SETTLEMENT_ID = "stl_2608mera01";
export const MEERA_PERIOD_START = Date.parse("2026-07-31T18:30:00.000Z");
export const MEERA_PERIOD_END = Date.parse("2026-08-31T18:29:59.999Z");
export const MEERA_SETTLED_AT = Date.parse("2026-09-03T05:30:00.000Z");

export const MEERA_MERCHANT: RawMerchant = {
  id: "mer_meera01",
  name: "Meera",
  segment: "D2C skincare, ₹12L/month",
  planLabel: "Flat 2% — all instruments",
  planHeadlineBps: 200,
  /* §3.7. The arithmetic is real and every rule behind it is real. She is not. */
  constructed: true,
};

/* --------------------------------------------------------------- slices */

export type SliceTarget = {
  instrument: Instrument;
  reportedAs: string;
  grossPaise: number;
  paymentCount: number;
};

/**
 * Three of these five report to her as the same word. That collapse is the
 * product's finding, and it is why the mix is declared per sub-type here.
 */
export const MEERA_SLICES: readonly SliceTarget[] = [
  { instrument: "upi_bank_account", reportedAs: "UPI", grossPaise: rupees(7_20_000), paymentCount: 640 },
  { instrument: "upi_rupay_credit", reportedAs: "UPI", grossPaise: rupees(1_20_000), paymentCount: 85 },
  { instrument: "upi_ppi", reportedAs: "UPI", grossPaise: rupees(60_000), paymentCount: 55 },
  { instrument: "card_credit", reportedAs: "Card", grossPaise: rupees(2_40_000), paymentCount: 145 },
  { instrument: "netbanking", reportedAs: "Netbanking", grossPaise: rupees(60_000), paymentCount: 35 },
];

export const MEERA_REFUND_COUNT = 41;
export const MEERA_REFUND_TOTAL = rupees(32_000);
export const MEERA_DISPUTE_COUNT = 2;
export const MEERA_DISPUTE_UNIT_PRINCIPAL = rupees(2_700);
export const MEERA_FAILED_ATTEMPT_COUNT = 1_100;
export const MEERA_ON_DEMAND_BASE = rupees(3_00_000);
export const MEERA_ON_DEMAND_FEES = rupees(900);
export const MEERA_ON_DEMAND_TAX = rupees(162);

/* --------------------------------------------------------------- events */

/** Spread deterministically across the period, then sorted. No clock, no rng. */
const spread = (i: number, n: number): number =>
  MEERA_PERIOD_START + Math.floor((i * (MEERA_PERIOD_END - MEERA_PERIOD_START)) / Math.max(1, n));

function buildPayments(): RawPayment[] {
  const out: RawPayment[] = [];
  let n = 0;
  for (const slice of MEERA_SLICES) {
    for (const amountPaise of partition(slice.grossPaise, slice.paymentCount)) {
      out.push({
        id: "pay_meera_" + String(n).padStart(4, "0"),
        amountPaise,
        instrument: slice.instrument,
        reportedAs: slice.reportedAs,
        capturedAt: spread(n, 960),
        });
      n += 1;
    }
  }
  return out.sort((a, b) => a.capturedAt - b.capturedAt);
}

export const MEERA_PAYMENTS: RawPayment[] = buildPayments();

/**
 * Refunds are zipped largest-to-largest against the payments.
 *
 * A refund larger than the payment it refunds is impossible, and pairing the
 * biggest part with the biggest host makes it structurally impossible rather
 * than statistically unlikely.
 */
function buildRefunds(): RawRefund[] {
  const parts = partition(MEERA_REFUND_TOTAL, MEERA_REFUND_COUNT).sort((a, b) => b - a);
  const hosts = [...MEERA_PAYMENTS].sort((a, b) => b.amountPaise - a.amountPaise);

  return parts.map((amountPaise, i) => {
    const host = hosts[i];
    if (!host) throw new Error("meera: more refunds than payments");
    if (amountPaise > host.amountPaise) {
      throw new Error("meera: refund " + amountPaise + "p exceeds host payment " + host.amountPaise + "p");
    }
    return {
      id: "rfnd_meera_" + String(i).padStart(3, "0"),
      paymentId: host.id,
      amountPaise,
      refundedAt: Math.min(host.capturedAt + 86_400_000, MEERA_PERIOD_END),
    };
  });
}

export const MEERA_REFUNDS: RawRefund[] = buildRefunds();

function buildDisputes(): RawDispute[] {
  const hosts = [...MEERA_PAYMENTS]
    .filter((p) => p.amountPaise >= MEERA_DISPUTE_UNIT_PRINCIPAL)
    .sort((a, b) => b.amountPaise - a.amountPaise);

  return Array.from({ length: MEERA_DISPUTE_COUNT }, (_, i) => {
    const host = hosts[i] ?? MEERA_PAYMENTS[i];
    if (!host) throw new Error("meera: no payment large enough to host a dispute");
    return {
      id: "disp_meera_" + String(i).padStart(2, "0"),
      paymentId: host.id,
      /* Uniform within the cycle: the contract's chargeback line carries one
       * unitAmount and a formula reading "2 disputes × ₹2,700". */
      principalPaise: MEERA_DISPUTE_UNIT_PRINCIPAL,
      raisedAt: Math.min(host.capturedAt + 172_800_000, MEERA_PERIOD_END),
    };
  });
}

export const MEERA_DISPUTES: RawDispute[] = buildDisputes();

const ERROR_CODES = [
  "BAD_REQUEST_ERROR",
  "GATEWAY_ERROR",
  "payment_failed",
  "insufficient_funds",
  "authentication_failed",
] as const;

function buildFailedAttempts(): RawFailedAttempt[] {
  return Array.from({ length: MEERA_FAILED_ATTEMPT_COUNT }, (_, i) => {
    const slice = MEERA_SLICES[i % MEERA_SLICES.length];
    if (!slice) throw new Error("meera: no slice to attribute a failed attempt to");
    return {
      id: "att_meera_" + String(i).padStart(4, "0"),
      instrument: slice.instrument,
      errorCode: ERROR_CODES[i % ERROR_CODES.length] ?? "payment_failed",
      attemptedAt: spread(i, MEERA_FAILED_ATTEMPT_COUNT),
    };
  });
}

export const MEERA_FAILED_ATTEMPTS: RawFailedAttempt[] = buildFailedAttempts();

/* ----------------------------------------------------------- stated net */

const GROSS = MEERA_SLICES.reduce((a, s) => a + s.grossPaise, 0);

/**
 * The rail's own number, computed here from the policy's rules and NOT from
 * the engine. Two independent arithmetic paths agreeing to the paisa is what
 * makes `delta === 0` an assertion rather than a restatement.
 *
 * The gateway fee is a percentage of gross, not of gross-minus-refunds.
 */
const GATEWAY = Math.round((GROSS * 200) / 10_000);
export const MEERA_STATED_NET =
  GROSS -
  GATEWAY -
  MEERA_REFUND_TOTAL -
  Math.round((GATEWAY * 1800) / 10_000) -
  MEERA_FAILED_ATTEMPT_COUNT * rupees(3) -
  MEERA_DISPUTE_COUNT * MEERA_DISPUTE_UNIT_PRINCIPAL -
  MEERA_DISPUTE_COUNT * rupees(500) -
  (MEERA_ON_DEMAND_FEES + MEERA_ON_DEMAND_TAX);

/* ----------------------------------------------------------- the cycle */

export const MEERA_CYCLE: RawCycle = {
  id: MEERA_SETTLEMENT_ID,
  cycleId: MEERA_CYCLE_ID,
  cycleLabel: "August 2026",
  periodStart: MEERA_PERIOD_START,
  periodEnd: MEERA_PERIOD_END,
  settledAt: MEERA_SETTLED_AT,
  statedNetPaise: MEERA_STATED_NET,
  status: "settled",
  merchant: MEERA_MERCHANT,
  payments: MEERA_PAYMENTS,
  refunds: MEERA_REFUNDS,
  disputes: MEERA_DISPUTES,
  failedAttempts: MEERA_FAILED_ATTEMPTS,
  settlement: {
    settlementId: MEERA_SETTLEMENT_ID,
    settledAt: MEERA_SETTLED_AT,
    onDemand: true,
    onDemandBasePaise: MEERA_ON_DEMAND_BASE,
    feesPaise: MEERA_ON_DEMAND_FEES,
    taxPaise: MEERA_ON_DEMAND_TAX,
    status: "settled",
  },
  /**
   * The one thing the report she is given cannot tell her. The gateway fee
   * leans on this, which is why its basis is not verifiable and why the
   * ceiling is ₹24,000 rather than zero.
   */
  gaps: [
    {
      id: "gap_instrument_sub_type",
      field: "instrument_sub_type",
      lookedIn: "settlement recon report row (`method` only, which reads UPI for all three rails)",
      consequence:
        "The gateway fee cannot be attributed across rails carrying different statutory MDR, so its basis cannot be checked from the report.",
      affectedCount: 780,
    },
  ],
};
