/**
 * Throwaway. Discovers the actual shape of Razorpay's read-only test-mode
 * responses and writes them, scrubbed, to docs/razorpay-shapes.json.
 *
 *   pnpm spike:razorpay
 *
 * Rules this script obeys, because the output is committed to a public repo:
 *   - it never prints a key, not even a prefix;
 *   - it only ever issues GETs;
 *   - it redacts every account-identifying value before writing;
 *   - it records an empty collection as explicitly as a populated one.
 *
 * Endpoint paths below were each confirmed against the published docs on
 * 2026-09-04 rather than recalled. The sources are recorded in the output file.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "docs/razorpay-shapes.json");

/** Hard cap. The brief allows 30 minutes of calling and not a second more. */
const CAP_MS = 30 * 60 * 1000;
const startedAt = Date.now();
const capReached = () => Date.now() - startedAt >= CAP_MS;

/* ------------------------------------------------------------ credentials */

/** Minimal .env.local reader. No dependency, and it never echoes a value. */
function loadEnvLocal(): void {
  let text: string;
  try {
    text = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();
const KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const haveCredentials = KEY_ID.length > 0 && KEY_SECRET.length > 0;

/* --------------------------------------------------------------- scrubbing */

/** Values that identify an account or a person. Never written to the file. */
const REDACT_EXACT = new Set([
  "account_id", "email", "contact", "customer_id", "vpa", "notes", "receipt",
  "description", "name", "last4", "issuer", "international", "token_id",
  "card_id", "bank_account", "ifsc", "beneficiary_name", "account_number",
  "acquirer_data", "evidence", "upi_transaction_id", "rrn", "auth_code",
]);

/** Ids carry a meaningful type prefix. Keep the prefix, drop the identity. */
const ID_KEY = /(^id$)|(_id$)/;

function scrubValue(key: string, value: unknown, depth: number): unknown {
  if (depth > 12) return "<depth-limit>";
  if (REDACT_EXACT.has(key)) return "<redacted>";

  if (value === null) return null;
  if (Array.isArray(value)) {
    // One representative element is enough to learn the shape.
    return value.length === 0 ? [] : [scrubValue(key, value[0], depth + 1), ...(value.length > 1 ? ["<+" + (value.length - 1) + " more>"] : [])];
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubValue(k, v, depth + 1);
    return out;
  }
  if (typeof value === "string" && ID_KEY.test(key)) {
    const m = /^([a-z]+_)/.exec(value);
    return (m?.[1] ?? "") + "<redacted>";
  }
  return value;
}

const scrub = (body: unknown): unknown => scrubValue("$", body, 0);

/* ------------------------------------------------------------------ calls */

const BASE = "https://api.razorpay.com";
const auth = "Basic " + Buffer.from(KEY_ID + ":" + KEY_SECRET).toString("base64");

type Probe = {
  name: string;
  path: string;
  /** Where the path came from. Confirmed, never recalled. */
  source: string;
  why: string;
  /**
   * Fields the published docs say this endpoint returns, read off the page on
   * 2026-09-04. This is `documented`, not `observed` — it is what we were told,
   * and it is superseded by a real response the moment one is captured.
   */
  documentedFields: Record<string, string>;
};

const PROBES: Probe[] = [
  {
    name: "listSettlements",
    path: "/v1/settlements?count=3",
    source: "https://razorpay.com/docs/api/settlements/",
    why: "The cycles Assay explains. Each becomes one CycleRef.",
    documentedFields: {
      id: "string, settlement id",
      entity: "string, \"settlement\"",
      amount: "integer paise, the net credited",
      status: "string, created | processed | failed",
      fees: "integer paise",
      tax: "integer paise",
      utr: "string, bank reference",
      created_at: "integer, unix seconds",
    },
  },
  {
    name: "settlementReconCombined",
    path: "/v1/settlements/recon/combined?year=" + new Date().getUTCFullYear() + "&month=" + String(new Date().getUTCMonth() + 1).padStart(2, "0"),
    source: "https://razorpay.com/docs/api/settlements/",
    why: "The transaction-level breakdown. The explanation view is a rendering of this.",
    documentedFields: {
      _shape: "Keyed by year+month, NOT by settlement id. A cycle must be located within a month.",
      entity_id: "string, the payment/refund/dispute this row is for",
      type: "string, payment | refund | dispute | transfer | adjustment",
      debit: "integer paise",
      credit: "integer paise",
      amount: "integer paise",
      fee: "integer paise, per row",
      tax: "integer paise, per row",
      settled_at: "integer, unix seconds",
      settlement_id: "string",
    },
  },
  {
    name: "listInstantSettlements",
    path: "/v1/settlements/ondemand?count=3",
    source: "https://razorpay.com/docs/api/settlements/instant/entity/",
    why: "\u00a74.1: we read `fees` and `tax` off this, rather than typing a rate.",
    documentedFields: {
      id: "string, setlod_ prefix",
      entity: "string, \"settlement.ondemand\"",
      amount_requested: "integer paise",
      amount_settled: "integer paise, net of fees and tax",
      amount_pending: "integer paise",
      amount_reversed: "integer paise",
      fees: "integer paise — CONFIRMED PRESENT. \u00a74.1 depends on this existing.",
      tax: "integer paise — CONFIRMED PRESENT.",
      status: "string, created | initiated | partially_processed | processed | reversed",
      settle_full_balance: "boolean",
      created_at: "integer, unix seconds",
      ondemand_payouts: "object, expand[]=ondemand_payouts to populate",
    },
  },
  {
    name: "listPayments",
    path: "/v1/payments?count=3",
    source: "https://razorpay.com/docs/api/payments/fetch-all-payments/",
    why: "Gross captured, and the instrument sub-type behind the finding.",
    documentedFields: {
      id: "string, pay_ prefix",
      amount: "integer paise",
      status: "string, created | authorized | captured | refunded | failed",
      method: "string, card | netbanking | wallet | emi | upi",
      "upi.payer_account_type": "string, bank_account | credit_card | wallet — THE SUB-TYPE. Present here, absent from the settlement report.",
      "upi.flow": "string, intent | collect | in_app",
      "card.type": "string, debit | credit | prepaid",
      "card.network": "string, e.g. RuPay, Visa",
      bank: "string, 4-char bank code, netbanking only",
      wallet: "string, wallet name",
      fee: "integer paise",
      tax: "integer paise",
      created_at: "integer, unix seconds",
    },
  },
  {
    name: "listRefunds",
    path: "/v1/refunds?count=3",
    source: "https://razorpay.com/docs/api/refunds/fetch-all/",
    why: "Refund principal.",
    documentedFields: {
      id: "string, rfnd_ prefix",
      amount: "integer paise",
      payment_id: "string",
      status: "string, pending | processed | failed",
      speed_processed: "string, normal | optimum",
      created_at: "integer, unix seconds",
    },
  },
  {
    name: "listDisputes",
    path: "/v1/disputes?count=3",
    source: "https://razorpay.com/docs/api/disputes/fetch-all/",
    why: "Chargeback principal, via amount_deducted.",
    documentedFields: {
      id: "string, disp_ prefix",
      payment_id: "string",
      amount: "integer paise, the disputed amount",
      amount_deducted: "integer paise, non-zero only when status is lost",
      reason_code: "string",
      status: "string, open | under_review | won | lost | closed",
      phase: "string, fraud | retrieval | chargeback | pre_arbitration | arbitration",
      respond_by: "integer, unix seconds",
      created_at: "integer, unix seconds",
    },
  },
];
type Finding = {
  endpoint: string;
  path: string;
  confirmedAgainst: string;
  whyAssayCaresAboutIt: string;
  documentedFields: Record<string, string>;
  observed: boolean;
  status: "populated" | "empty" | "error" | "not_called";
  note: string;
  httpStatus?: number;
  itemCount?: number;
  sample?: unknown;
};

async function probe(p: Probe): Promise<Finding> {
  const base = {
    endpoint: p.name,
    path: p.path,
    confirmedAgainst: p.source,
    whyAssayCaresAboutIt: p.why,
    documentedFields: p.documentedFields,
    observed: false,
  };

  if (!haveCredentials) {
    return { ...base, status: "not_called", note: "No RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env.local, so no call was made." };
  }
  if (capReached()) {
    return { ...base, status: "not_called", note: "30-minute spike cap reached before this endpoint was called." };
  }

  try {
    const res = await fetch(BASE + p.path, {
      method: "GET",
      headers: { authorization: auth, accept: "application/json" },
    });
    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ...base,
        status: "error",
        observed: true,
        httpStatus: res.status,
        note: "Razorpay refused this call. The scrubbed error body is the sample.",
        sample: scrub(json),
      };
    }

    const items = (json as { items?: unknown[] } | null)?.items;
    const count = Array.isArray(items) ? items.length : undefined;

    if (Array.isArray(items) && items.length === 0) {
      return {
        ...base,
        status: "empty",
        observed: true,
        httpStatus: res.status,
        itemCount: 0,
        note: "Endpoint answered correctly with an empty collection. Expected on a fresh test account; the envelope shape is still recorded.",
        sample: scrub(json),
      };
    }

    return {
      ...base,
      status: "populated",
      observed: true,
      httpStatus: res.status,
      itemCount: count,
      note: "Shape captured from a live test-mode response, scrubbed.",
      sample: scrub(json),
    };
  } catch (e) {
    return { ...base, status: "error", note: "Request failed: " + (e instanceof Error ? e.message : String(e)) };
  }
}

/* ------------------------------------------------------------------- main */

const findings: Finding[] = [];
for (const p of PROBES) findings.push(await probe(p));

const doc = {
  note: "Generated by scripts/spike-razorpay.mts. Read-only test mode. Values are scrubbed; keys and value types are preserved. No key material is present in this file.",
  generatedAt: new Date().toISOString(),
  credentialsPresent: haveCredentials,
  capMinutes: 30,
  elapsedMs: Date.now() - startedAt,
  endpoints: Object.fromEntries(findings.map((f) => [f.endpoint, f])),
};

mkdirSync(resolve(ROOT, "docs"), { recursive: true });
writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");

const tally = findings.reduce<Record<string, number>>((a, f) => ({ ...a, [f.status]: (a[f.status] ?? 0) + 1 }), {});
console.log("wrote " + OUT);
console.log("credentials " + (haveCredentials ? "present" : "ABSENT — nothing was called"));
console.log(Object.entries(tally).map(([k, v]) => k + " " + v).join("  ·  "));
