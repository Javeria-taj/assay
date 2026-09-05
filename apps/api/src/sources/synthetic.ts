import { bps, rupees, CycleId, SettlementId } from "@assay/contract";
import type { Instrument, Paise, Policy, PolicyLine } from "@assay/contract";
import { attributionOf } from "../domain/attribution.js";
import { COMMITTED_POLICY } from "../domain/committed-policy.js";
import { mintCycleId, mintSettlementId } from "../domain/ids.js";
import { INSTRUMENTS } from "../domain/instrument.js";
import { MEERA_MERCHANT } from "../domain/meera.js";
import { partition } from "../domain/partition.js";
import type {
  CycleRef,
  RawCycle,
  RawDispute,
  RawFailedAttempt,
  RawMerchant,
  RawPayment,
  RawRefund,
  SourceGap,
} from "../domain/raw-cycle.js";
import { memo } from "../store.js";
import { intBetween, pick, rngFor, shuffled } from "./rng.js";
import type { SettlementSource } from "./source.js";

/**
 * The synthetic settlement generator.
 *
 * The obvious way to build this is backwards, and it does not work. You cannot
 * draw 960 plausible payments, sum them, and hope to land on ₹12,00,000 split
 * 640 / 85 / 55 / 145 / 35 across five rails with per-slice grosses that are
 * each exact to the paisa. No amount of re-rolling gets there.
 *
 * So the arrow is reversed. **The totals are inputs.** A seed and a set of
 * slice targets come first; `partition()` then splits each declared target into
 * that many positive integer parts which sum back to it exactly, by
 * construction rather than by luck. The seed does not decide how much money
 * there is. It decides only the *shape* — ticket-size spread, where in the
 * month a payment lands, which payments carry a refund, which attempts failed,
 * and for a non-canonical cycle which rails are present at all.
 *
 * `partition()` is the seam's, already used by `MEERA_CYCLE` without an rng.
 * This file adds exactly two things on top of it: a seeded generator, and
 * realism. It divides no money of its own.
 *
 * Two further properties are load-bearing rather than incidental:
 *
 *  - Nothing here reads a clock and nothing draws on the host's own source of
 *    randomness. A cycle is a pure function of its seed, so the canonical seed
 *    reproduces on any machine, in CI, at any hour.
 *  - `statedNetOf` is a deliberate *second* implementation of the settlement
 *    arithmetic, independent of `apps/api/src/engine/**`. It is the rail's own
 *    number. If the calculator supplied it, `reconciliation.delta === 0` would
 *    be a restatement instead of an assertion. See §"stated net" below.
 */

/* ============================================================ the seeds === */

export const CANONICAL_SEED = "meera-2026-08";

/**
 * Meera's five earlier cycles, newest first. Also the backtest corpus.
 *
 * These strings are chosen, not derived: the coverage assertion in
 * `generator.test.ts` needs a `wallet` slice somewhere in the corpus and one
 * cycle carrying both `card_debit` and `card_credit`. When it does not hold the
 * fix is to change a seed string — never to special-case the drawing, which
 * would make the coverage test a test of the special case.
 */
export const HISTORICAL_SEEDS: readonly string[] = [
  "meera-2026-07",
  "meera-2026-06",
  "meera-2026-05",
  "meera-2026-04",
  "meera-2026-03",
];

/** Canonical first, then the history newest-first. Length 6. */
export const SEEDS: readonly string[] = [CANONICAL_SEED, ...HISTORICAL_SEEDS];

/* ============================================================== the spec === */

export interface SliceTarget {
  instrument: Instrument;
  /** What HER report calls it: "UPI" | "Card" | "Netbanking" | "Wallet". */
  reportedAs: string;
  /** Positive, and never below `paymentCount` — `partition` refuses otherwise. */
  grossPaise: Paise;
  paymentCount: number;
}

/** Everything the seed decides, before a single event object exists. */
export interface CycleSpec {
  seed: string;
  cycleId: string;
  cycleLabel: string;
  settlementId: string;
  periodStart: number;
  periodEnd: number;
  settledAt: number;
  merchant: RawMerchant;
  slices: SliceTarget[];
  refundCount: number;
  refundTotalPaise: Paise;
  disputeCount: number;
  /** UNIFORM within a cycle. The contract's chargeback line carries one `unitAmount`. */
  disputeUnitPrincipalPaise: Paise;
  failedAttemptCount: number;
  onDemand: boolean;
  onDemandBasePaise: Paise;
  /** The simulated rail's `settlement.fees`. Read by the engine, never computed by it. */
  feesPaise: Paise;
  /** The simulated rail's `settlement.tax`. */
  taxPaise: Paise;
}

/* ------------------------------------------------------------- drawing bands */

/**
 * Every bound the drawing works within, in one block so a change is visible.
 * None of these is a fee rate: they are the shape of a believable D2C skincare
 * month. The rates that turn a rupee into another rupee live on the `Policy`
 * and are read from it in `statedNetOf`.
 */
const MIN_SLICES = 3;
const MAX_SLICES = 6;
/** Per-slice gross, in whole rupees. ₹20,000 to ₹9,00,000. */
const MIN_SLICE_GROSS_RUPEES = 20_000;
const MAX_SLICE_GROSS_RUPEES = 900_000;
/** Mean ticket band, in paise: three hundred to four thousand rupees. */
const MIN_MEAN_TICKET_PAISE = 30_000;
const MAX_MEAN_TICKET_PAISE = 400_000;
/** Refund count, per mille of payments: 4.0% to 6.0%. */
const MIN_REFUND_PER_MILLE = 40;
const MAX_REFUND_PER_MILLE = 60;
/** Refund value as a share of gross: 1.50% to 2.50%. */
const MIN_REFUND_SHARE_BPS = 150;
const MAX_REFUND_SHARE_BPS = 250;
/** Failed attempts, per mille of payments: 60% to 160%. */
const MIN_FAILED_PER_MILLE = 600;
const MAX_FAILED_PER_MILLE = 1_600;
/** Dispute principal band, in whole rupees. ₹500 to ₹5,000. */
const MIN_DISPUTE_PRINCIPAL_RUPEES = 500;
const MAX_DISPUTE_PRINCIPAL_RUPEES = 5_000;
const MAX_DISPUTES = 4;
/** On-demand base as a share of gross: 10% to 40%. */
const MIN_ON_DEMAND_SHARE_BPS = 1_000;
const MAX_ON_DEMAND_SHARE_BPS = 4_000;
/** The rail's own on-demand fee, in whole rupees. */
const MIN_ON_DEMAND_FEE_RUPEES = 100;
const MAX_ON_DEMAND_FEE_RUPEES = 2_000;

/**
 * The statutory GST rate the RAIL applies to its own on-demand fee, in bps.
 *
 * This is not a merchant-facing rate and Assay computes no merchant rupee with
 * it. It is the arithmetic relation between two fields the rail *returns* —
 * `settlement.fees` and `settlement.tax` — used here to emit a consistent pair
 * and asserted by `checkCycle`. Every rate that turns a merchant's rupee into
 * another rupee is read off the approved `Policy`; see `statedNetOf`.
 */
const RAIL_GST_BPS = 1_800;

const MS_PER_DAY = 86_400_000;

/* --------------------------------------------------------- calendar helpers */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const days = MONTH_LENGTHS[month - 1];
  if (days === undefined) throw new Error("synthetic: month out of range: " + month);
  return days;
}

const two = (n: number): string => String(n).padStart(2, "0");

/**
 * An instant in IST, from parts. `Date.parse` of an ISO string with an explicit
 * +05:30 offset. No host clock and no host timezone reaches this.
 */
function istInstant(year: number, month: number, day: number, hourMinute: string): number {
  const iso = year + "-" + two(month) + "-" + two(day) + "T" + hourMinute + ":00.000+05:30";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error("synthetic: could not parse instant " + iso);
  return t;
}

const SEED_SHAPE = /^[a-z0-9-]+-(\d{4})-(\d{2})$/;

type SeedMonth = { year: number; month: number };

function monthOf(seed: string): SeedMonth {
  const m = SEED_SHAPE.exec(seed);
  if (!m || m[1] === undefined || m[2] === undefined) {
    throw new Error(
      'synthetic: seed "' + seed + '" is not of the form <name>-YYYY-MM, e.g. "meera-2026-08".',
    );
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    throw new Error('synthetic: seed "' + seed + '" names month ' + month + ", which is not 1–12.");
  }
  return { year, month };
}

/* ------------------------------------------------------------ rail labelling */

/**
 * What the merchant's own report calls a rail. Three UPI sub-types collapse to
 * one word here, and that collapse is the product's entire finding.
 */
function reportedAsFor(instrument: Instrument): string {
  if (instrument.startsWith("upi_")) return "UPI";
  if (instrument.startsWith("card_")) return "Card";
  if (instrument === "netbanking") return "Netbanking";
  return "Wallet";
}

/* ================================================================ specFor === */

const CANONICAL_SLICES: SliceTarget[] = [
  { instrument: "upi_bank_account", reportedAs: "UPI", grossPaise: rupees(7_20_000), paymentCount: 640 },
  { instrument: "upi_rupay_credit", reportedAs: "UPI", grossPaise: rupees(1_20_000), paymentCount: 85 },
  { instrument: "upi_ppi", reportedAs: "UPI", grossPaise: rupees(60_000), paymentCount: 55 },
  { instrument: "card_credit", reportedAs: "Card", grossPaise: rupees(2_40_000), paymentCount: 145 },
  { instrument: "netbanking", reportedAs: "Netbanking", grossPaise: rupees(60_000), paymentCount: 35 },
];

/**
 * The canonical spec is hand-typed, every other spec is drawn.
 *
 * Its identity fields are literals rather than minted values because the
 * `Explanation` this cycle produces has to be byte-identical to the fixture the
 * frontend has already been served. A minted `cyc_` id would be valid and
 * wrong.
 *
 * `merchant` is the seam's `MEERA_MERCHANT` rather than a second hand-typed
 * copy: Meera does not change plan between cycles, and the argument
 * `committed-policy.ts` makes about the policy applies here too — a second copy
 * drifts from the first the day one of them changes, silently.
 */
function canonicalSpec(): CycleSpec {
  const periodStart = Date.parse("2026-07-31T18:30:00.000Z");
  return {
    seed: CANONICAL_SEED,
    cycleId: "cyc_202608",
    cycleLabel: "August 2026",
    settlementId: "stl_2608mera01",
    periodStart,
    periodEnd: Date.parse("2026-08-31T18:29:59.999Z"),
    settledAt: Date.parse("2026-09-03T05:30:00.000Z"),
    merchant: MEERA_MERCHANT,
    slices: CANONICAL_SLICES.map((s) => ({ ...s })),
    refundCount: 41,
    refundTotalPaise: rupees(32_000),
    disputeCount: 2,
    /* The canonical dispute principal, ₹2,700. A principal, not a rate and not
     * a fee: it is the value of the disputed payment itself. */
    disputeUnitPrincipalPaise: rupees(2_700),
    failedAttemptCount: 1_100,
    onDemand: true,
    onDemandBasePaise: rupees(3_00_000),
    feesPaise: rupees(900),
    taxPaise: rupees(162),
  };
}

function drawnSpec(seed: string): CycleSpec {
  const { year, month } = monthOf(seed);
  const rng = rngFor(seed + ":spec");

  const periodStart = istInstant(year, month, 1, "00:00");
  const periodEnd = periodStart + daysInMonth(year, month) * MS_PER_DAY - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const settledAt = istInstant(nextYear, nextMonth, 3, "11:00");
  const monthName = MONTH_NAMES[month - 1];
  if (monthName === undefined) throw new Error("synthetic: no name for month " + month);

  /* Rails, drawn without replacement. Which rails ran at all is part of the
   * shape a seed varies. */
  const sliceCount = intBetween(rng, MIN_SLICES, MAX_SLICES);
  const instruments = shuffled(rng, INSTRUMENTS).slice(0, sliceCount);

  const slices: SliceTarget[] = instruments.map((instrument) => {
    const grossPaise = rupees(intBetween(rng, MIN_SLICE_GROSS_RUPEES, MAX_SLICE_GROSS_RUPEES));
    /* How MANY parts, not how much money. The only split of a rupee in this
     * file goes through `partition`; these two bounds pick a part count that
     * puts the mean ticket inside a believable band. */
    const minCount = Math.ceil(grossPaise / MAX_MEAN_TICKET_PAISE);
    const maxCount = Math.floor(grossPaise / MIN_MEAN_TICKET_PAISE);
    const paymentCount = intBetween(rng, Math.max(1, minCount), Math.max(1, maxCount));
    return { instrument, reportedAs: reportedAsFor(instrument), grossPaise, paymentCount };
  });

  const grossPaise = slices.reduce((a, s) => a + s.grossPaise, 0);
  const totalPayments = slices.reduce((a, s) => a + s.paymentCount, 0);

  const refundCount = Math.max(
    1,
    Math.floor((totalPayments * intBetween(rng, MIN_REFUND_PER_MILLE, MAX_REFUND_PER_MILLE)) / 1_000),
  );
  const refundTotalPaise = bps(grossPaise, intBetween(rng, MIN_REFUND_SHARE_BPS, MAX_REFUND_SHARE_BPS));

  const failedAttemptCount = Math.floor(
    (totalPayments * intBetween(rng, MIN_FAILED_PER_MILLE, MAX_FAILED_PER_MILLE)) / 1_000,
  );

  /* A dispute needs a payment large enough to host it. `partition` guarantees
   * every part of a slice is at least 60% of that slice's base ticket, so
   * capping the principal there makes "no eligible host" impossible rather than
   * unlikely. When even the fattest slice cannot host the band's floor, this
   * month simply had no disputes — an honest outcome, not a special case. */
  const fattestBase = slices.reduce(
    (best, s) => Math.max(best, Math.floor(s.grossPaise / s.paymentCount)),
    0,
  );
  const principalFloor = rupees(MIN_DISPUTE_PRINCIPAL_RUPEES);
  const principalCeiling = Math.min(rupees(MAX_DISPUTE_PRINCIPAL_RUPEES), Math.floor(fattestBase * 0.6));
  const canHostDispute = principalCeiling >= principalFloor;
  const disputeCount = canHostDispute ? intBetween(rng, 0, MAX_DISPUTES) : 0;
  const disputeUnitPrincipalPaise =
    disputeCount === 0 ? 0 : intBetween(rng, principalFloor, principalCeiling);

  const onDemand = rng() < 0.5;
  const onDemandBasePaise = onDemand
    ? bps(grossPaise, intBetween(rng, MIN_ON_DEMAND_SHARE_BPS, MAX_ON_DEMAND_SHARE_BPS))
    : 0;
  const feesPaise = onDemand
    ? rupees(intBetween(rng, MIN_ON_DEMAND_FEE_RUPEES, MAX_ON_DEMAND_FEE_RUPEES))
    : 0;
  const taxPaise = onDemand ? bps(feesPaise, RAIL_GST_BPS) : 0;

  return {
    seed,
    cycleId: mintCycleId(seed),
    cycleLabel: monthName + " " + year,
    settlementId: mintSettlementId(seed),
    periodStart,
    periodEnd,
    settledAt,
    merchant: MEERA_MERCHANT,
    slices,
    refundCount,
    refundTotalPaise,
    disputeCount,
    disputeUnitPrincipalPaise,
    failedAttemptCount,
    onDemand,
    onDemandBasePaise,
    feesPaise,
    taxPaise,
  };
}

export function specFor(seed: string): CycleSpec {
  return seed === CANONICAL_SEED ? canonicalSpec() : drawnSpec(seed);
}

/* ============================================================ stated net === */

function lineOf(policy: Policy, id: string): PolicyLine {
  const line = policy.lines.find((l) => l.id === id);
  if (!line) throw new Error("statedNetOf: policy " + policy.id + " carries no line " + id + ".");
  if (!line.approved) {
    throw new Error(
      "statedNetOf: policy line " +
        id +
        " is not approved. An unapproved line computes no rupee, here or in the engine.",
    );
  }
  return line;
}

function rateOf(line: PolicyLine): number {
  if (line.rateBps === null) {
    throw new Error("statedNetOf: policy line " + line.id + " carries no rateBps to apply.");
  }
  return line.rateBps;
}

function fixedOf(line: PolicyLine): Paise {
  if (line.fixedAmount === null) {
    throw new Error("statedNetOf: policy line " + line.id + " carries no fixedAmount to apply.");
  }
  return line.fixedAmount;
}

/**
 * What the rail says landed — computed here, by the rail, on purpose.
 *
 * `RawCycle.statedNetPaise` is an INDEPENDENT input to the engine. If the
 * calculator derived it from its own lines then `reconciliation.delta === 0`
 * would be a tautology: the waterfall would be checking its own arithmetic
 * against itself. This function is therefore a second implementation, and it
 * imports nothing from `apps/api/src/engine/**`.
 *
 * Every rate it applies is read off the passed `Policy` — `rateBps` for P-01
 * and P-02, `fixedAmount` for P-03 and P-04, and the rail's own two returned
 * fields for P-05. No rate is typed into this file. It is written out as one
 * straight-line expression rather than a loop over policy lines, because a loop
 * would converge on the calculator's shape and the duplication is the point.
 *
 * Note the gateway fee is a percentage of GROSS, not of gross-minus-refunds.
 */
export function statedNetOf(spec: CycleSpec, policy: Policy): Paise {
  const gross = spec.slices.reduce((a, s) => a + s.grossPaise, 0);

  const gatewayLine = lineOf(policy, "P-01");
  const taxLine = lineOf(policy, "P-02");
  const failedLine = lineOf(policy, "P-03");
  const disputeLine = lineOf(policy, "P-04");
  const onDemandLine = lineOf(policy, "P-05");
  if (onDemandLine.readFromApi === null) {
    throw new Error(
      "statedNetOf: policy line P-05 must name the rail fields it is read from; it names none.",
    );
  }

  const gateway = bps(gross, rateOf(gatewayLine));

  return (
    gross -
    gateway -
    spec.refundTotalPaise -
    bps(gateway, rateOf(taxLine)) -
    spec.failedAttemptCount * fixedOf(failedLine) -
    spec.disputeCount * spec.disputeUnitPrincipalPaise -
    spec.disputeCount * fixedOf(disputeLine) -
    (spec.onDemand ? spec.feesPaise + spec.taxPaise : 0)
  );
}

/* ============================================================== generate === */

const ERROR_CODES = [
  "BAD_REQUEST_ERROR",
  "GATEWAY_ERROR",
  "payment_failed",
  "insufficient_funds",
  "authentication_failed",
] as const;

/**
 * The spec a cycle was generated from.
 *
 * `checkCycle` takes only a `RawCycle` — that is the shape a downstream caller
 * has — but half its invariants are "the events add back up to what the seed
 * asked for", which needs the spec. This is a lookup, not state: it holds no
 * rng, it never changes what `generate` returns, and two calls with one seed
 * still deep-equal.
 */
const SPEC_OF = new WeakMap<RawCycle, CycleSpec>();

/** Deterministic spread across the period, plus a seeded intra-day offset, clamped. */
function instantAt(i: number, count: number, spec: CycleSpec, rng: () => number): number {
  const span = spec.periodEnd - spec.periodStart;
  const base = spec.periodStart + Math.floor((i * span) / Math.max(1, count));
  const at = base + intBetween(rng, 0, MS_PER_DAY - 1);
  if (at < spec.periodStart) return spec.periodStart;
  if (at > spec.periodEnd) return spec.periodEnd;
  return at;
}

function buildPayments(spec: CycleSpec): RawPayment[] {
  const total = spec.slices.reduce((a, s) => a + s.paymentCount, 0);
  const clock = rngFor(spec.seed + ":timestamps");
  const drafts: { amountPaise: Paise; instrument: Instrument; reportedAs: string; capturedAt: number }[] =
    [];

  let i = 0;
  for (const slice of spec.slices) {
    /* One generator per slice, so adding a rail to a later seed cannot shift
     * the tickets of an earlier one. */
    const rng = rngFor(spec.seed + ":payments:" + slice.instrument);
    /* The shuffle is not decoration. `partition` puts its residual on the last
     * element, so an unshuffled slice always ends in a systematically odd
     * ticket — which reads as generated the moment anyone scrolls. Shuffling
     * preserves the sum exactly. */
    for (const amountPaise of shuffled(rng, partition(slice.grossPaise, slice.paymentCount, rng))) {
      drafts.push({
        amountPaise,
        instrument: slice.instrument,
        reportedAs: slice.reportedAs,
        capturedAt: instantAt(i, total, spec, clock),
      });
      i += 1;
    }
  }

  drafts.sort((a, b) => a.capturedAt - b.capturedAt);
  const tag = spec.cycleId.slice(4);
  return drafts.map((d, n) => ({ id: "pay_" + tag + "_" + String(n).padStart(5, "0"), ...d }));
}

/**
 * Refunds, zipped largest-to-largest.
 *
 * `partition` will happily hand back a part bigger than some randomly chosen
 * host payment, and a refund larger than the payment it refunds is not a rare
 * case to handle — it is an impossible record. Sorting both sides descending
 * and zipping makes it structurally impossible instead of statistically
 * unlikely: if the largest part fits the largest payment, every other pair fits
 * too.
 */
function buildRefunds(spec: CycleSpec, payments: readonly RawPayment[]): RawRefund[] {
  if (spec.refundCount === 0) return [];
  const rng = rngFor(spec.seed + ":refunds");
  const parts = partition(spec.refundTotalPaise, spec.refundCount, rng).sort((a, b) => b - a);
  const hosts = [...payments].sort((a, b) => b.amountPaise - a.amountPaise);
  const tag = spec.cycleId.slice(4);

  return parts.map((amountPaise, i) => {
    const host = hosts[i];
    if (!host) {
      throw new Error(
        "synthetic: seed " + spec.seed + " drew " + spec.refundCount + " refunds against only " + hosts.length + " payments.",
      );
    }
    if (amountPaise > host.amountPaise) {
      throw new Error(
        "synthetic: seed " +
          spec.seed +
          " drew a refund of " +
          amountPaise +
          "p against a host payment of " +
          host.amountPaise +
          "p. The spec is bad; change the seed rather than clamping the refund.",
      );
    }
    return {
      id: "rfnd_" + tag + "_" + String(i).padStart(4, "0"),
      paymentId: host.id,
      amountPaise,
      refundedAt: intBetween(rng, host.capturedAt, spec.periodEnd),
    };
  });
}

function buildDisputes(spec: CycleSpec, payments: readonly RawPayment[]): RawDispute[] {
  if (spec.disputeCount === 0) return [];
  const rng = rngFor(spec.seed + ":disputes");
  const eligible = payments.filter((p) => p.amountPaise >= spec.disputeUnitPrincipalPaise);
  if (eligible.length < spec.disputeCount) {
    throw new Error(
      "synthetic: seed " +
        spec.seed +
        " needs " +
        spec.disputeCount +
        " payments of at least " +
        spec.disputeUnitPrincipalPaise +
        "p to host disputes, and only " +
        eligible.length +
        " are that large.",
    );
  }
  const tag = spec.cycleId.slice(4);
  return shuffled(rng, eligible)
    .slice(0, spec.disputeCount)
    .map((host, i) => ({
      id: "disp_" + tag + "_" + String(i).padStart(3, "0"),
      paymentId: host.id,
      /* Uniform within the cycle. The contract's chargeback line carries a
       * single `unitAmount` and a formula reading "2 disputes × ₹2,700"; two
       * different principals would make that line a lie. Vary it across seeds. */
      principalPaise: spec.disputeUnitPrincipalPaise,
      raisedAt: intBetween(rng, host.capturedAt, spec.periodEnd),
    }));
}

function buildFailedAttempts(spec: CycleSpec): RawFailedAttempt[] {
  if (spec.failedAttemptCount === 0) return [];
  const rng = rngFor(spec.seed + ":failed");
  const clock = rngFor(spec.seed + ":failed:timestamps");
  const tag = spec.cycleId.slice(4);

  /* Attribute a failure to a rail in proportion to how much that rail ran. */
  const cumulative: number[] = [];
  let running = 0;
  for (const slice of spec.slices) {
    running += slice.paymentCount;
    cumulative.push(running);
  }

  return Array.from({ length: spec.failedAttemptCount }, (_, i) => {
    const draw = intBetween(rng, 0, Math.max(0, running - 1));
    let chosen = spec.slices[spec.slices.length - 1];
    for (let s = 0; s < spec.slices.length; s += 1) {
      const edge = cumulative[s];
      if (edge !== undefined && draw < edge) {
        chosen = spec.slices[s];
        break;
      }
    }
    if (!chosen) throw new Error("synthetic: seed " + spec.seed + " has no slice to attribute a failure to.");
    return {
      id: "att_" + tag + "_" + String(i).padStart(5, "0"),
      instrument: chosen.instrument,
      errorCode: pick(rng, ERROR_CODES),
      attemptedAt: instantAt(i, spec.failedAttemptCount, spec, clock),
    };
  });
}

/**
 * The one thing the report cannot say.
 *
 * The settlement recon report carries `method`, which reads "UPI" for three
 * rails carrying three different statutory MDRs. Assay declares that as a gap
 * rather than guessing around it, and a line's `basisVerifiable` is false
 * exactly when it leaned on one. `affectedCount` is the payments on the rails
 * whose sub-type the report collapses — `attributionOf` decides which those
 * are, so this file does not reimplement the mapping.
 */
function buildGaps(spec: CycleSpec): SourceGap[] {
  const collapsed = spec.slices.filter((s) => attributionOf(s) === "instrument_subtype");
  if (collapsed.length === 0) return [];
  return [
    {
      id: "gap_instrument_sub_type",
      field: "instrument_sub_type",
      lookedIn: "settlement recon report row (`method` only, which reads UPI for all three rails)",
      consequence:
        "The gateway fee cannot be attributed across rails carrying different statutory MDR, so its basis cannot be checked from the report.",
      affectedCount: collapsed.reduce((a, s) => a + s.paymentCount, 0),
    },
  ];
}

export function generate(seed: string): RawCycle {
  const spec = specFor(seed);
  const payments = buildPayments(spec);

  const cycle: RawCycle = {
    id: spec.settlementId,
    cycleId: spec.cycleId,
    cycleLabel: spec.cycleLabel,
    periodStart: spec.periodStart,
    periodEnd: spec.periodEnd,
    settledAt: spec.settledAt,
    statedNetPaise: statedNetOf(spec, COMMITTED_POLICY),
    status: "settled",
    merchant: spec.merchant,
    payments,
    refunds: buildRefunds(spec, payments),
    disputes: buildDisputes(spec, payments),
    failedAttempts: buildFailedAttempts(spec),
    settlement: {
      settlementId: spec.settlementId,
      settledAt: spec.settledAt,
      onDemand: spec.onDemand,
      onDemandBasePaise: spec.onDemandBasePaise,
      feesPaise: spec.feesPaise,
      taxPaise: spec.taxPaise,
      status: "settled",
    },
    gaps: buildGaps(spec),
  };

  SPEC_OF.set(cycle, spec);
  return cycle;
}

/* ============================================================ checkCycle === */

/**
 * A structural self-check over a generated cycle. `[]` means pass.
 *
 * This is how five unseen seeds are validated without anyone hand-typing five
 * expected outputs: nothing here asserts a *value*, only that the cycle is
 * internally consistent with the spec that produced it and with the shapes the
 * frozen contract enforces.
 */
export function checkCycle(cycle: RawCycle): string[] {
  const problems: string[] = [];
  const spec = SPEC_OF.get(cycle);
  const byId = new Map(cycle.payments.map((p) => [p.id, p]));
  const paymentTotal = cycle.payments.reduce((a, p) => a + p.amountPaise, 0);

  /* 1 — payments sum to the declared slice targets, and each is a real rupee. */
  if (spec) {
    const target = spec.slices.reduce((a, s) => a + s.grossPaise, 0);
    if (paymentTotal !== target) {
      problems.push("payments sum to " + paymentTotal + "p, the slice targets sum to " + target + "p");
    }
    /* 2 — one payment per declared part. */
    const targetCount = spec.slices.reduce((a, s) => a + s.paymentCount, 0);
    if (cycle.payments.length !== targetCount) {
      problems.push("cycle has " + cycle.payments.length + " payments, the slices declare " + targetCount);
    }
  }
  for (const p of cycle.payments) {
    if (!Number.isInteger(p.amountPaise) || p.amountPaise < 1) {
      problems.push("payment " + p.id + " carries " + p.amountPaise + "p, which is not a positive integer");
    }
  }

  /* 3 — refunds sum to the declared total, in the declared number of parts. */
  const refundTotal = cycle.refunds.reduce((a, r) => a + r.amountPaise, 0);
  if (spec) {
    if (refundTotal !== spec.refundTotalPaise) {
      problems.push("refunds sum to " + refundTotal + "p, the spec declares " + spec.refundTotalPaise + "p");
    }
    if (cycle.refunds.length !== spec.refundCount) {
      problems.push("cycle has " + cycle.refunds.length + " refunds, the spec declares " + spec.refundCount);
    }
  }

  /* 4 — every refund has a real host it does not exceed. */
  for (const r of cycle.refunds) {
    const host = byId.get(r.paymentId);
    if (!host) {
      problems.push("refund " + r.id + " points at payment " + r.paymentId + ", which is not in this cycle");
      continue;
    }
    if (r.amountPaise > host.amountPaise) {
      problems.push(
        "refund " + r.id + " of " + r.amountPaise + "p exceeds its host payment of " + host.amountPaise + "p",
      );
    }
  }

  /* 5 — disputes: real hosts, and one principal for the whole cycle. */
  const principals = new Set(cycle.disputes.map((d) => d.principalPaise));
  if (principals.size > 1) {
    problems.push(
      "cycle carries " + principals.size + " different dispute principals; the chargeback line holds one unitAmount",
    );
  }
  for (const d of cycle.disputes) {
    const host = byId.get(d.paymentId);
    if (!host) {
      problems.push("dispute " + d.id + " points at payment " + d.paymentId + ", which is not in this cycle");
      continue;
    }
    if (d.principalPaise > host.amountPaise) {
      problems.push(
        "dispute " + d.id + " claims " + d.principalPaise + "p against a payment of " + host.amountPaise + "p",
      );
    }
  }

  /* 6 — every instant sits inside the period, and no event precedes its host. */
  const inPeriod = (label: string, at: number): void => {
    if (at < cycle.periodStart || at > cycle.periodEnd) {
      problems.push(label + " at " + at + " falls outside [" + cycle.periodStart + ", " + cycle.periodEnd + "]");
    }
  };
  for (const p of cycle.payments) inPeriod("payment " + p.id, p.capturedAt);
  for (const a of cycle.failedAttempts) inPeriod("failed attempt " + a.id, a.attemptedAt);
  for (const r of cycle.refunds) {
    inPeriod("refund " + r.id, r.refundedAt);
    const host = byId.get(r.paymentId);
    if (host && r.refundedAt < host.capturedAt) {
      problems.push("refund " + r.id + " precedes the payment it refunds");
    }
  }
  for (const d of cycle.disputes) {
    inPeriod("dispute " + d.id, d.raisedAt);
    const host = byId.get(d.paymentId);
    if (host && d.raisedAt < host.capturedAt) {
      problems.push("dispute " + d.id + " precedes the payment it disputes");
    }
  }

  /* 7 — the settlement lands after the period it settles. */
  if (cycle.settlement.settledAt < cycle.periodEnd) {
    problems.push("settlement settles at " + cycle.settlement.settledAt + ", before the period ends");
  }
  if (spec && cycle.settlement.settledAt !== spec.settledAt) {
    problems.push(
      "settlement settles at " + cycle.settlement.settledAt + ", the spec declares " + spec.settledAt,
    );
  }
  if (cycle.settlement.settledAt !== cycle.settledAt) {
    problems.push("cycle.settledAt and settlement.settledAt disagree");
  }

  /* 8 — the rail's fee and its tax are a consistent pair. RAIL_GST_BPS is the
   * statutory rate being ASSERTED about two rail-returned fields, not a rate
   * used to compute a merchant-facing rupee. §4.1 is not in play here. */
  const { onDemand, feesPaise, taxPaise } = cycle.settlement;
  if (onDemand) {
    if (taxPaise !== bps(feesPaise, RAIL_GST_BPS)) {
      problems.push("on-demand tax " + taxPaise + "p is not GST on a fee of " + feesPaise + "p");
    }
  } else if (feesPaise !== 0 || taxPaise !== 0) {
    problems.push("cycle did not settle on demand yet carries a fee of " + feesPaise + "p and tax of " + taxPaise + "p");
  }

  /* 9 — the stated net is a real number of paise, and less than what came in. */
  if (!Number.isInteger(cycle.statedNetPaise) || cycle.statedNetPaise <= 0) {
    problems.push("stated net is " + cycle.statedNetPaise + "p, which is not a positive integer");
  }
  if (cycle.statedNetPaise >= paymentTotal) {
    problems.push("stated net " + cycle.statedNetPaise + "p is not below gross captured " + paymentTotal + "p");
  }

  /* 10 — the ids satisfy the frozen schemas, not a regex retyped here. */
  if (!CycleId.safeParse(cycle.cycleId).success) {
    problems.push("cycleId " + cycle.cycleId + " does not satisfy the contract's CycleId");
  }
  if (!SettlementId.safeParse(cycle.settlement.settlementId).success) {
    problems.push("settlementId " + cycle.settlement.settlementId + " does not satisfy the contract's SettlementId");
  }

  /* 11 — every id in the cycle is unique. */
  const seen = new Set<string>();
  const ids = [
    ...cycle.payments.map((p) => p.id),
    ...cycle.refunds.map((r) => r.id),
    ...cycle.disputes.map((d) => d.id),
    ...cycle.failedAttempts.map((a) => a.id),
  ];
  for (const id of ids) {
    if (seen.has(id)) problems.push("id " + id + " appears more than once in this cycle");
    seen.add(id);
  }

  return problems;
}

/* ================================================================ source === */

const cycleFor = (seed: string): RawCycle => memo("synthetic", seed, () => generate(seed));

const refOf = (cycle: RawCycle): CycleRef => ({
  id: cycle.id,
  cycleId: cycle.cycleId,
  cycleLabel: cycle.cycleLabel,
  periodStart: cycle.periodStart,
  periodEnd: cycle.periodEnd,
  settledAt: cycle.settledAt,
  statedNetPaise: cycle.statedNetPaise,
});

/**
 * The synthetic source, replacing Batch 2's throwing stub.
 *
 * It reads no environment variable. Which source runs, and under which seeds,
 * is `config.ts`'s decision; this file only exports the factory it calls.
 */
export function syntheticSource(seeds: readonly string[] = SEEDS): SettlementSource {
  return {
    kind: "synthetic",
    async listCycles(): Promise<CycleRef[]> {
      return seeds.map((seed) => refOf(cycleFor(seed)));
    },
    async getCycle(id: string): Promise<RawCycle | null> {
      for (const seed of seeds) {
        const cycle = cycleFor(seed);
        if (cycle.cycleId === id) return cycle;
      }
      return null;
    },
  };
}

/** The class shape `sources/index.ts` constructs. Delegates to the factory. */
export class SyntheticSettlementSource implements SettlementSource {
  readonly kind = "synthetic" as const;
  readonly #inner: SettlementSource;

  constructor(seeds: readonly string[] = SEEDS) {
    this.#inner = syntheticSource(seeds);
  }

  listCycles(): Promise<CycleRef[]> {
    return this.#inner.listCycles();
  }

  getCycle(id: string): Promise<RawCycle | null> {
    return this.#inner.getCycle(id);
  }
}

/**
 * The backtest corpus: five sealed prior cycles, newest first.
 *
 * Each carries `status: "settled"` and a real `statedNetPaise` produced by the
 * rail's own arithmetic, which is exactly what a replay needs to score itself
 * against. WS-4 consumes this; nothing here knows what a forecast is.
 */
export function historicalCycles(): RawCycle[] {
  return HISTORICAL_SEEDS.map((seed) => cycleFor(seed));
}
