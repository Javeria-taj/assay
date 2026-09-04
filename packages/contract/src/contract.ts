import { z } from "zod";

/* ============================================================================
 * Assay API contract  —  v0.1.0
 *
 * Frozen 2026-09-04 13:30 IST. Any change after the freeze is a two-person
 * decision announced in chat, and bumps CONTRACT_VERSION.
 *
 * Conventions (see API_CONTRACT.md):
 *   money      integer paise, signed. Deductions negative. Never a float.
 *   time       epoch milliseconds, integer.
 *   envelope   { ok: true, data, requestId } | { ok: false, error, requestId }
 *   paging     cursor-based: { items, nextCursor }
 * ==========================================================================*/

export const CONTRACT_VERSION = "0.1.0";

/* ----------------------------------------------------------------- scalars */

export const PaiseSchema = z.number().int();
export const EpochMs = z.number().int().nonnegative();
/** Fraction 0..1, 4dp. 0.3376 = 33.76%. */
export const Share = z.number().min(0).max(1);

export const SettlementId = z.string().regex(/^stl_[A-Za-z0-9]{6,}$/);
export const CycleId = z.string().regex(/^cyc_[A-Za-z0-9]{6,}$/);
export const PolicyId = z.string().regex(/^pol_[A-Za-z0-9]{6,}$/);

/* ---------------------------------------------------------------- envelope */

export const ApiError = z.object({
  code: z.enum([
    "not_found",
    "bad_request",
    "unauthorized",
    "policy_not_approved",
    "reconciliation_failed",
    "internal",
  ]),
  message: z.string(),
  /** Field path when the error is a validation failure. */
  field: z.string().nullable().default(null),
});
export type ApiError = z.infer<typeof ApiError>;

export function ok<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data, requestId: z.string() });
}
export const ErrorResponse = z.object({
  ok: z.literal(false),
  error: ApiError,
  requestId: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export function paged<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}

/* --------------------------------------------------------------- citations */

/**
 * Where a number came from. §4.1: rupees come from a rail-returned field or a
 * human-approved policy line — never from a rate we typed in.
 *
 *   api_field    read verbatim off the rail's response (strongest)
 *   policy_line  model-parsed from a rate card / T&C, human-approved
 *   statute      a published law or regulation
 *   derived      deterministic arithmetic over other cited lines
 */
export const CitationKind = z.enum(["api_field", "policy_line", "statute", "derived"]);
export type CitationKind = z.infer<typeof CitationKind>;

export const Citation = z.object({
  kind: CitationKind,
  /** Chip text in the UI. Keep under 18 chars. e.g. "API · settlement.fees" */
  label: z.string(),
  /** Stable id of the source: policy line id, API field path, or statute ref. */
  sourceId: z.string(),
  title: z.string(),
  /** Verbatim text of the rule, when there is one. Rendered in the line drawer. */
  quote: z.string().nullable().default(null),
  url: z.string().url().nullable().default(null),
  /** Set only for policy_line: a human approved this before it was ever used. */
  approvedAt: EpochMs.nullable().default(null),
  approvedBy: z.string().nullable().default(null),
});
export type Citation = z.infer<typeof Citation>;

/* -------------------------------------------------------------- instrument */

/**
 * The finding lives here. bank UPI, RuPay-credit-on-UPI and PPI-on-UPI carry
 * different statutory MDR and are all labelled "UPI" on the merchant's report.
 */
export const Instrument = z.enum([
  "upi_bank_account",
  "upi_rupay_credit",
  "upi_ppi",
  "card_debit",
  "card_credit",
  "netbanking",
  "wallet",
]);
export type Instrument = z.infer<typeof Instrument>;

export const InstrumentSlice = z.object({
  instrument: Instrument,
  displayLabel: z.string(),
  /** What the merchant's own report calls it. The collapse is the point. */
  reportedAs: z.string(),
  grossCaptured: PaiseSchema,
  paymentCount: z.number().int().nonnegative(),
  /** Statutory network MDR in basis points. 0 for bank-account UPI. */
  networkMdrBps: z.number().int().nonnegative(),
  /** What this merchant was actually charged on this slice, under her plan. */
  feeCharged: PaiseSchema,
  /** True when this slice is indistinguishable from another in her report. */
  collapsedInReport: z.boolean(),
  citation: Citation,
});
export type InstrumentSlice = z.infer<typeof InstrumentSlice>;

/* ------------------------------------------------------------- explanation */

export const LineKind = z.enum([
  "gross_captured",
  "gateway_fee",
  "refund_principal",
  "tax_on_fees",
  "failed_payment_fee",
  "chargeback_principal",
  "chargeback_fee",
  "instant_settlement_fee",
  "adjustment",
  "net_credited",
]);
export type LineKind = z.infer<typeof LineKind>;

export const BasisInput = z.object({
  label: z.string(),
  /** Rendered verbatim. Money inputs arrive pre-formatted by the server. */
  value: z.string(),
});

/** How the number was produced. Every one of these is deterministic code. */
export const Basis = z.object({
  formula: z.string(),
  inputs: z.array(BasisInput),
  computedBy: z.literal("deterministic"),
});
export type Basis = z.infer<typeof Basis>;

export const ExplanationLine = z.object({
  id: z.string(),
  kind: LineKind,
  label: z.string(),
  /** Signed paise. Deductions negative. gross_captured and net_credited are markers. */
  amount: PaiseSchema,
  /** Balance after applying this line. net_credited.runningBalance === netCredited. */
  runningBalance: PaiseSchema,
  /** Unit count where the line is a per-event charge (1,100 failed attempts). */
  count: z.number().int().nonnegative().nullable().default(null),
  unitAmount: PaiseSchema.nullable().default(null),
  basis: Basis,
  citation: Citation,

  /* --- the two axes of the ceiling, per line ------------------------------ */

  /** Does the merchant see this line, itemised, anywhere she is given? */
  onMerchantReport: z.boolean(),
  /** Does the amount reconcile against the rail's own figures? */
  amountReconciled: z.boolean(),
  /**
   * Can the merchant CHECK the rule that produced it from fields she is given?
   * False is not an accusation — it is a missing field, named below.
   */
  basisVerifiable: z.boolean(),
  /** Required when basisVerifiable is false. Names the missing field. */
  unverifiableReason: z.string().nullable().default(null),
});
export type ExplanationLine = z.infer<typeof ExplanationLine>;

export const MerchantPlan = z.object({
  label: z.string(),
  /** Headline rate the merchant believes she is on, in bps. 200 = flat 2%. */
  headlineBps: z.number().int().nonnegative(),
  citation: Citation,
});

export const Merchant = z.object({
  id: z.string(),
  name: z.string(),
  segment: z.string(),
  plan: MerchantPlan,
  /**
   * ALWAYS true in every shipped fixture. §3.7: Meera is constructed. The
   * arithmetic is correct and every rule behind it is real; the volumes were
   * chosen to show scale at a believable Indian SMB. The UI must render this.
   */
  constructed: z.literal(true),
});

export const Reconciliation = z.object({
  ok: z.boolean(),
  /** Sum of the signed lines. */
  computedNet: PaiseSchema,
  /** What the rail says landed. */
  statedNet: PaiseSchema,
  /** computedNet - statedNet. Must be 0 to the paise or the build fails. */
  delta: PaiseSchema,
});
export type Reconciliation = z.infer<typeof Reconciliation>;

export const Explanation = z.object({
  settlementId: SettlementId,
  cycleId: CycleId,
  cycleLabel: z.string(),
  periodStart: EpochMs,
  periodEnd: EpochMs,
  settledAt: EpochMs,
  merchant: Merchant,

  grossCaptured: PaiseSchema,
  netCredited: PaiseSchema,
  /** What she expected: gross − headline rate − refunds. Her mental model. */
  merchantExpected: PaiseSchema,
  expectationBasis: z.string(),
  /** merchantExpected − netCredited. The number on the front of the video. */
  unexplainedGap: PaiseSchema,

  lines: z.array(ExplanationLine).min(2),
  instrumentMix: z.array(InstrumentSlice),
  reconciliation: Reconciliation,
  policyId: PolicyId,
});
export type Explanation = z.infer<typeof Explanation>;

/* ----------------------------------------------------------------- ceiling */

export const MissingField = z.object({
  id: z.string(),
  name: z.string(),
  whyItMatters: z.string(),
  /** PaiseSchema of delta that would become basis-verifiable if this field existed. */
  wouldResolve: PaiseSchema,
  citation: Citation,
});
export type MissingField = z.infer<typeof MissingField>;

export const CeilingBucket = z.object({ amount: PaiseSchema, share: Share });

/**
 * The explainability ceiling, on two axes that must not be conflated:
 *   amountReconciled  — do the numbers add up? (almost always yes)
 *   basisVerifiable   — can she CHECK them from fields she is given? (the gap)
 */
export const Ceiling = z.object({
  settlementId: SettlementId,
  /** grossCaptured − netCredited. The whole delta, not just the surprise. */
  totalDelta: PaiseSchema,
  amountReconciled: CeilingBucket,
  amountUnreconciled: CeilingBucket,
  basisVerifiable: CeilingBucket,
  basisUnverifiable: CeilingBucket,
  missingFields: z.array(MissingField).min(1),
  /** Constructive framing, not accusatory. Rendered above the bar. */
  headline: z.string(),
  method: z.string(),
  zeroMdrExposure: z.object({
    grossOnZeroMdrRails: PaiseSchema,
    feeLeviedOnZeroMdrRails: PaiseSchema,
    annualisedFee: PaiseSchema,
    note: z.string(),
    citations: z.array(Citation).min(1),
  }),
});
export type Ceiling = z.infer<typeof Ceiling>;

/* ------------------------------------------------------------ watch / 3-day */

export const WindowStatus = z.enum(["open", "closing", "expired"]);

export const DisputeWindow = z.object({
  settlementId: SettlementId,
  settledAt: EpochMs,
  /** settledAt + 3 days, per the clause in `clause`. */
  deadlineAt: EpochMs,
  /** Server-computed at request time so the client never guesses the clock. */
  serverNow: EpochMs,
  msRemaining: z.number().int(),
  status: WindowStatus,
  /** "closing" once under this many ms. */
  closingThresholdMs: z.number().int().positive(),
  clause: Citation,
});
export type DisputeWindow = z.infer<typeof DisputeWindow>;

export const DiscrepancyReport = z.object({
  settlementId: SettlementId,
  generatedAt: EpochMs,
  window: DisputeWindow,
  subject: z.string(),
  /** Markdown. Copy button and download both use this verbatim. */
  body: z.string(),
  /** Every claim in the body, machine-checkable, for the UI to cross-link. */
  claims: z.array(
    z.object({
      lineId: z.string(),
      statement: z.string(),
      amount: PaiseSchema,
      citation: Citation,
    }),
  ),
  disputedTotal: PaiseSchema,
});
export type DiscrepancyReport = z.infer<typeof DiscrepancyReport>;

/* ---------------------------------------------------------------- forecast */

export const Forecast = z.object({
  cycleId: CycleId,
  asOf: EpochMs,
  expectedSettlementAt: EpochMs,
  capturedSoFar: PaiseSchema,
  /** Same deterministic engine as `explain`, run forward. Not a model. */
  projectedNet: PaiseSchema,
  projectedLines: z.array(ExplanationLine),
  backtest: z.object({
    method: z.literal("policy_engine_replay"),
    cycles: z.number().int().nonnegative(),
    medianAbsError: PaiseSchema,
    maxAbsError: PaiseSchema,
    note: z.string(),
  }),
});
export type Forecast = z.infer<typeof Forecast>;

/* ------------------------------------------------------------------ policy */

export const PolicyLine = z.object({
  id: z.string(),
  label: z.string(),
  appliesTo: z.string(),
  /** Exactly one of rateBps / fixedAmount / readFromApi is meaningful. */
  rateBps: z.number().int().nullable().default(null),
  fixedAmount: PaiseSchema.nullable().default(null),
  readFromApi: z.string().nullable().default(null),
  quote: z.string(),
  url: z.string().url().nullable().default(null),
  /** The model produced this line; a human approved it before first use. */
  parsedBy: z.literal("model"),
  approved: z.boolean(),
  approvedBy: z.string().nullable().default(null),
  approvedAt: EpochMs.nullable().default(null),
  /** documented = traceable to a published source. constructed = our scenario. */
  provenance: z.enum(["documented", "constructed"]),
});
export type PolicyLine = z.infer<typeof PolicyLine>;

export const Policy = z.object({
  id: PolicyId,
  version: z.string(),
  label: z.string(),
  sourceDocuments: z.array(z.object({ title: z.string(), url: z.string().url().nullable() })),
  approvedBy: z.string(),
  approvedAt: EpochMs,
  lines: z.array(PolicyLine).min(1),
});
export type Policy = z.infer<typeof Policy>;

/* ------------------------------------------------------------- list/summary */

export const SettlementSummary = z.object({
  id: SettlementId,
  cycleId: CycleId,
  cycleLabel: z.string(),
  settledAt: EpochMs,
  grossCaptured: PaiseSchema,
  netCredited: PaiseSchema,
  merchantExpected: PaiseSchema,
  unexplainedGap: PaiseSchema,
  windowStatus: WindowStatus,
  basisUnverifiableShare: Share,
});
export type SettlementSummary = z.infer<typeof SettlementSummary>;

export const Health = z.object({
  status: z.literal("ok"),
  contractVersion: z.string(),
  source: z.enum(["mock", "live"]),
  serverNow: EpochMs,
});

/* --------------------------------------------------------------- endpoints */

/**
 * The single source of truth for routes. verify-contract.ts iterates this, so
 * an endpoint that is not listed here is not part of the contract.
 */
export const endpoints = {
  health: { method: "GET", path: "/v1/health", response: ok(Health) },
  listSettlements: {
    method: "GET",
    path: "/v1/settlements",
    response: ok(paged(SettlementSummary)),
  },
  getSettlement: {
    method: "GET",
    path: "/v1/settlements/:settlementId",
    response: ok(SettlementSummary),
  },
  getExplanation: {
    method: "GET",
    path: "/v1/settlements/:settlementId/explanation",
    response: ok(Explanation),
  },
  getCeiling: {
    method: "GET",
    path: "/v1/settlements/:settlementId/ceiling",
    response: ok(Ceiling),
  },
  getWindow: {
    method: "GET",
    path: "/v1/settlements/:settlementId/window",
    response: ok(DisputeWindow),
  },
  getReport: {
    method: "GET",
    path: "/v1/settlements/:settlementId/report",
    response: ok(DiscrepancyReport),
  },
  getForecast: { method: "GET", path: "/v1/forecast/current", response: ok(Forecast) },
  getPolicy: { method: "GET", path: "/v1/policy", response: ok(Policy) },
} as const;

export type EndpointName = keyof typeof endpoints;

/** Fill :params in an endpoint path. */
export function buildPath(name: EndpointName, params: Record<string, string> = {}): string {
  return endpoints[name].path.replace(/:([A-Za-z]+)/g, (_m, k: string) => {
    const v = params[k];
    if (!v) throw new Error("missing path param: " + k);
    return encodeURIComponent(v);
  });
}
