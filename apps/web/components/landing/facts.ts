import {
  CEILING,
  CHARGEBACK_UNIT_FEE,
  CHARGEBACK_UNIT_PRINCIPAL,
  EXPLANATION,
  EXPLANATION_LINES,
  FAILED_UNIT,
  FIXTURE_SETTLED_AT,
  GATEWAY_FEE,
  GROSS_CAPTURED,
  HEADLINE_BPS,
  INSTANT_API_FEES,
  INSTANT_API_TAX,
  INSTRUMENT_MIX,
  MERCHANT_EXPECTED,
  NET_CREDITED,
  SETTLEMENT_ID,
  TOTAL_DELTA,
  UNEXPLAINED_GAP,
  rupees,
} from "@assay/contract";
import type { Citation, ExplanationLine } from "@assay/contract";
import { count, istTimestamp, money, percent, signed } from "@/lib/format";

/**
 * The landing page's facts.
 *
 * The design reference computed these inline from typed constants. Here they
 * come off the frozen contract fixture instead — the same `EXPLANATION` and
 * `CEILING` the engine's tests reproduce to the paisa and the API serves over
 * HTTP. Nothing on the page is a number somebody keyed in twice: if the
 * fixture moves, the page moves with it.
 *
 * Money is integer paise everywhere and reaches the screen only through
 * `money()` / `signed()`. The one place paise are divided is `U()`, which is
 * not a display: it is the scale of the drawing, ₹200 to the geometric unit.
 */

export { SETTLEMENT_ID };

/* ------------------------------------------------------------------ money */

const GAP_ANNUALISED = UNEXPLAINED_GAP * 12;
const UPI_RAILS = INSTRUMENT_MIX.filter((s) => s.reportedAs === "UPI");
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

const UPI_GROSS = sum(UPI_RAILS.map((s) => s.grossCaptured));
const UPI_FEE = sum(UPI_RAILS.map((s) => s.feeCharged));
const RAILS_GROSS = sum(INSTRUMENT_MIX.map((s) => s.grossCaptured));
const RAILS_FEE = sum(INSTRUMENT_MIX.map((s) => s.feeCharged));

const ZERO = CEILING.zeroMdrExposure;
const FIELDS = CEILING.missingFields;

/** Every rupee the page prints, formatted once. */
export const M = {
  gross: money(GROSS_CAPTURED),
  fee: signed(-GATEWAY_FEE),
  feePlain: money(GATEWAY_FEE, { paise: false }),
  expected: money(MERCHANT_EXPECTED),
  net: money(NET_CREDITED),
  gap: money(UNEXPLAINED_GAP),
  gapPlain: money(UNEXPLAINED_GAP, { paise: false }),
  gapAnnual: money(GAP_ANNUALISED, { paise: false }),
  delta: money(TOTAL_DELTA),
  deltaPlain: money(TOTAL_DELTA, { paise: false }),
  deltaSigned: signed(-TOTAL_DELTA),
  verifiable: money(CEILING.basisVerifiable.amount),
  unverifiable: money(CEILING.basisUnverifiable.amount),
  unverifiablePlain: money(CEILING.basisUnverifiable.amount, { paise: false }),
  instantFees: money(INSTANT_API_FEES, { paise: false }),
  instantTax: money(INSTANT_API_TAX, { paise: false }),
  failedUnit: money(FAILED_UNIT, { paise: false }),
  cbPrincipal: money(CHARGEBACK_UNIT_PRINCIPAL, { paise: false }),
  cbFee: money(CHARGEBACK_UNIT_FEE, { paise: false }),
  zeroGross: money(ZERO.grossOnZeroMdrRails, { paise: false }),
  zeroFee: money(ZERO.feeLeviedOnZeroMdrRails, { paise: false }),
  zeroAnnual: money(ZERO.annualisedFee, { paise: false }),
  upiGross: money(UPI_GROSS, { paise: false }),
  upiFee: money(UPI_FEE, { paise: false }),
  railsGross: money(RAILS_GROSS, { paise: false }),
  railsFee: money(RAILS_FEE, { paise: false }),
  settledAt: istTimestamp(FIXTURE_SETTLED_AT),
  cycle: EXPLANATION.cycleLabel,
  rate: (HEADLINE_BPS / 100).toFixed(2) + "%",
} as const;

/** The two axes of the ceiling, as the bars and the headline state them. */
export const CEIL = {
  reconciledPct: percent(CEILING.amountReconciled.share, 0),
  verifiablePct: percent(CEILING.basisVerifiable.share),
  unverifiablePct: percent(CEILING.basisUnverifiable.share),
  /** Bar widths keep the full precision the shares carry: 66.24 / 33.76. */
  verifiableWidth: CEILING.basisVerifiable.share * 100 + "%",
  unverifiableWidth: CEILING.basisUnverifiable.share * 100 + "%",
} as const;

/** The three fields, and what each absence is worth. */
export const MISSING = FIELDS.map((f) => ({
  id: f.id,
  name: f.name,
  amount: money(f.wouldResolve, { paise: false }),
}));

/** `₹18,000 + ₹4,800 + ₹1,200 = ₹24,000.` — the partition, spelled out. */
export const MISSING_SUM =
  MISSING.map((f) => f.amount).join(" + ") + " = " + M.unverifiablePlain;

/** The five rails behind the fee, and how three of them are reported. */
export const RAILS = INSTRUMENT_MIX.map((s) => ({
  name: s.displayLabel,
  gross: money(s.grossCaptured, { paise: false }),
  /* Netbanking's zero is not a statutory zero — it carries a flat per-transaction
     bank charge rather than an ad-valorem MDR, which is why the ceiling excludes
     it from the zero-MDR exposure. Printing "0 bps" here would say otherwise. */
  mdr: s.instrument === "netbanking" ? "flat" : count(s.networkMdrBps) + " bps",
  fee: money(s.feeCharged, { paise: false }),
  collapsed: s.reportedAs === "UPI",
}));

/* ------------------------------------------------------------- the lines */

/** L-00 … L-08, with the running balance the fixture computed. */
export const LINES: ExplanationLine[] = EXPLANATION_LINES;

const line = (id: string): ExplanationLine => {
  const l = LINES.find((x) => x.id === id);
  if (!l) throw new Error("no line " + id);
  return l;
};

/** The five lines below the breakpoint: everything the merchant did not count. */
export const BELOW = LINES.slice(3, 8);

export const L = {
  gross: line("L-00"),
  fee: line("L-01"),
  refunds: line("L-02"),
  gst: line("L-03"),
  failed: line("L-04"),
  chargebacks: line("L-05"),
  cbFees: line("L-06"),
  onDemand: line("L-07"),
  net: line("L-08"),
} as const;

/** The hint under each row of the product's ledger. Copy, with real figures. */
export const HINTS: Record<string, string> = {
  "L-00": count(960) + " captured payments",
  "L-01": M.rate + " × gross captured",
  "L-02": "41 refunds settled",
  "L-03": "18% × gateway fee",
  "L-04": count(1100) + " attempts × " + M.failedUnit,
  "L-05": "2 disputes × " + M.cbPrincipal,
  "L-06": "2 disputes × " + M.cbFee,
  "L-07": "settlement.fees " + M.instantFees + " + settlement.tax " + M.instantTax,
  "L-08": "signed sum of the eight lines above",
};

/** Provenance kind → the chip that carries it, and what the kind means. */
export const KIND: Record<Citation["kind"], { chip: string; name: string; gloss: string }> = {
  api_field: { chip: "chip--api", name: "API field", gloss: "read directly from the rail" },
  policy_line: {
    chip: "chip--policy",
    name: "policy line",
    gloss: "parsed by model, approved by a human",
  },
  statute: { chip: "chip--statute", name: "statute", gloss: "published law or terms" },
  derived: { chip: "chip--derived", name: "derived", gloss: "deterministic arithmetic, in the open" },
};

/* ==========================================================================
   The cross-section, to scale. ₹200 per unit. The base slab is the credit
   itself, drawn with a scale break because it would be 5,645 units tall.
   ========================================================================== */

export const PW = 300;
export const PD = 190;
export const SLOT_GAP = 10;
/** Interface k sits between body k and k+1; 1 is the break. */
export const GAPS = [14, 30, 14, 14, 14, 14, 14];

const UNIT = rupees(200);
const U = (paise: number) => Math.abs(paise) / UNIT;

export interface Body {
  key: string;
  label: string;
  amt: string;
  thick: number;
  base?: boolean;
}

const plate = (key: string, l: ExplanationLine): Body => ({
  key,
  label: l.label,
  amt: signed(l.amount),
  thick: U(l.amount),
});

/** Seven deductions, thickest first, resting on the credit that landed. */
export const BODIES: Body[] = [
  plate("fee", L.fee),
  plate("refunds", L.refunds),
  plate("gst", L.gst),
  plate("failed", L.failed),
  plate("chargebacks", L.chargebacks),
  plate("cbfees", L.cbFees),
  plate("ondemand", L.onDemand),
  { key: "net", label: L.net.label, amt: M.net, thick: 132, base: true },
];

/** The three voids inside the fee plate. They partition it; they do not overlap. */
export const SLOTS = FIELDS.map((f) => ({
  key: f.id,
  label: f.name,
  amt: money(f.wouldResolve, { paise: false }),
  thick: U(f.wouldResolve),
}));

export interface Positions {
  pos: number[];
  top: number[];
  bot: number[];
  open: (k: number) => number;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** y-centres of the eight bodies for a given peel (0..7), bottom of base at 0. */
export function positions(peel: number): Positions {
  const open = (k: number) => smooth(clamp(peel - k, 0, 1));
  const pos = new Array<number>(8);
  const top = new Array<number>(8);
  const bot = new Array<number>(8);
  let y = 0;
  for (let i = 7; i >= 0; i--) {
    bot[i] = y;
    pos[i] = y + BODIES[i].thick / 2;
    y += BODIES[i].thick;
    top[i] = y;
    if (i > 0) y += GAPS[i - 1] * open(i - 1);
  }
  return { pos, top, bot, open };
}

export function centerOf(peel: number, from: number, to: number): number {
  const p = positions(peel);
  return (p.bot[to] + p.top[from]) / 2;
}

/** The plane label: the expected balance, drawn in the gap under refunds. */
export const PLANE_LABEL = { t: "expected balance", n: M.expected };
/** The ceiling label: the top of what the merchant can independently check. */
export const CEIL_LABEL = { t: "ceiling of what you can check", n: CEIL.verifiablePct + " verifiable" };
export const FEE_LABEL = { t: "Gateway fee at 2% · no evidence path", n: M.fee };
