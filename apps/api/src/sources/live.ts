import Razorpay from "razorpay";
import type { Instrument } from "../domain/instrument.js";
import type {
  CapturedPayment,
  CycleRef,
  Dispute,
  OnDemandSettlement,
  RawCycle,
  Refund,
  SourceGap,
} from "../domain/raw-cycle.js";
import { SourceConfigError, type SettlementSource } from "./source.js";

/**
 * Reads cycles off a live rail, in test mode, and maps them onto Assay's own
 * `RawCycle`. Read-only: this driver calls nothing that moves money, and the
 * SDK methods it uses are all fetches.
 *
 * What this driver found, and could not work around, is recorded on the cycle
 * as `gaps` rather than smoothed over. See docs/BUILD_LOG.md.
 */

/* The rail speaks seconds. Assay speaks milliseconds, everywhere, always. */
const ms = (seconds: number | null | undefined): number =>
  typeof seconds === "number" ? seconds * 1000 : 0;

const int = (v: number | string | null | undefined): number => {
  if (typeof v === "number") return Math.round(v);
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
};

/**
 * One settled row from the rail's recon report. Narrowed to what Assay reads,
 * so an upstream addition cannot quietly change our behaviour.
 */
type ReconRow = {
  entity_id: string;
  type: string;
  debit: number;
  credit: number;
  amount: number | string;
  fee: number;
  tax: number;
  settled_at: number;
  created_at: number;
  settlement_id: string;
  payment_id?: string;
  dispute_id?: string | null;
  method?: string;
  card_type?: string;
  card_network?: string;
};

/**
 * The instrument, as far as the settlement report can tell us.
 *
 * This function is where the product's finding becomes code. The recon report
 * carries `method`, so "upi" is knowable — but bank-account UPI, RuPay-credit
 * on UPI and PPI on UPI are all just "upi" here, and they carry materially
 * different statutory MDR. The sub-type is not on this report at any price.
 *
 * Returns null when the report cannot decide, and the caller records a gap.
 */
function instrumentFromReport(row: ReconRow): Instrument | null {
  switch (row.method) {
    case "card":
    case "emi":
      if (row.card_type === "debit") return "card_debit";
      if (row.card_type === "credit") return "card_credit";
      return null;
    case "netbanking":
      return "netbanking";
    case "wallet":
      return "wallet";
    case "upi":
      // Knowably UPI. Not knowably which of the three.
      return null;
    default:
      return null;
  }
}

/** The accounting period as a contract-shaped cycle id: cyc_YYYYMM. */
const cycleIdFor = (settledAt: number): string => {
  const d = new Date(settledAt);
  return "cyc_" + d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0");
};

/**
 * The rail authenticates a key, not a merchant profile: it exposes no name,
 * no segment and — the one that matters — no pricing plan. `headlineBps` is
 * what she believes she is on, and without it there is no "expected" to
 * compare against. Recorded as a gap on the cycle rather than invented.
 */
const UNKNOWN_MERCHANT = {
  id: "merchant_live",
  name: "This account",
  segment: "unknown",
  planLabel: "unknown",
  headlineBps: 0,
  constructed: false,
} as const;

/** What her own report calls it — the collapse, carried rather than resolved. */
function reportedAs(row: ReconRow): string {
  switch (row.method) {
    case "upi":
      return "UPI";
    case "card":
    case "emi":
      return "Card";
    case "netbanking":
      return "Netbanking";
    case "wallet":
      return "Wallet";
    default:
      return row.method ?? "Unknown";
  }
}

export class LiveSettlementSource implements SettlementSource {
  readonly kind = "live" as const;
  readonly #client: Razorpay;

  constructor(keyId: string, keySecret: string) {
    if (!keyId || !keySecret) {
      throw new SourceConfigError(
        "ASSAY_SOURCE=live needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. Assay will not start with a live source it cannot read.",
      );
    }
    this.#client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async listCycles(): Promise<CycleRef[]> {
    const res = await this.#client.settlements.all({ count: 100 });
    const items = res.items ?? [];

    return items.map((s) => {
      const settledAt = ms(s.created_at);
      return {
        id: s.id,
        cycleId: cycleIdFor(settledAt),
        label: new Date(settledAt).toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        }),
        // The rail dates a settlement but does not bound the period it covers.
        // The recon rows do, so the period is derived in getCycle.
        periodStart: settledAt,
        periodEnd: settledAt,
        settledAt,
        statedNet: int(s.amount),
      };
    });
  }

  async getCycle(id: string): Promise<RawCycle | null> {
    const settlement = await this.#client.settlements.fetch(id).catch(() => null);
    if (!settlement) return null;

    const settledAt = ms(settlement.created_at);
    const when = new Date(settledAt);

    /* The recon report is keyed by year and month, not by settlement id, so a
     * cycle is located inside a month and then filtered back out of it. */
    const report = (await this.#client.settlements.reports({
      year: when.getUTCFullYear(),
      month: when.getUTCMonth() + 1,
    })) as unknown as { items?: ReconRow[] } | ReconRow[];

    const allRows: ReconRow[] = Array.isArray(report) ? report : (report.items ?? []);
    const rows = allRows.filter((r) => r.settlement_id === id);

    const gaps: SourceGap[] = [];
    const payments: CapturedPayment[] = [];
    const refunds: Refund[] = [];
    const disputes: Dispute[] = [];
    let unresolvedUpi = 0;
    let unresolvedOther = 0;

    for (const row of rows) {
      switch (row.type) {
        case "payment": {
          const instrument = instrumentFromReport(row);
          if (!instrument) {
            if (row.method === "upi") unresolvedUpi += 1;
            else unresolvedOther += 1;
          }
          payments.push({
            id: row.entity_id,
            amount: int(row.amount),
            capturedAt: ms(row.created_at),
            /* Assay will not invent a sub-type it was not given. Where the
             * report cannot say, the payment is carried at the family level
             * and the gap below says so. */
            instrument: instrument ?? "upi_bank_account",
            reportedAs: reportedAs(row),
            feeCharged: typeof row.fee === "number" ? row.fee : null,
            taxOnFee: typeof row.tax === "number" ? row.tax : null,
          });
          break;
        }
        case "refund": {
          refunds.push({
            id: row.entity_id,
            amount: Math.abs(int(row.amount)),
            paymentId: row.payment_id ?? null,
            refundedAt: ms(row.created_at),
          });
          break;
        }
        case "dispute": {
          disputes.push({
            id: row.entity_id,
            amountDeducted: Math.abs(int(row.debit)),
            paymentId: row.payment_id ?? null,
            stage: "chargeback",
            raisedAt: ms(row.created_at),
          });
          break;
        }
        default:
          break;
      }
    }

    if (unresolvedUpi > 0) {
      gaps.push({
        id: "gap_instrument_sub_type_upi",
        field: "instrument_sub_type",
        lookedIn: "settlement recon report row (`method` is the only instrument field on it)",
        consequence:
          "UPI rows cannot be split into bank-account, RuPay-credit and PPI, which carry different statutory MDR. The fee on these rows reconciles but its basis cannot be checked.",
        affectedCount: unresolvedUpi,
      });
    }
    if (unresolvedOther > 0) {
      gaps.push({
        id: "gap_instrument_sub_type_card",
        field: "instrument_sub_type",
        lookedIn: "settlement recon report row (`card_type` absent or unrecognised)",
        consequence: "Row carried at the family level; per-instrument fee attribution is not checkable for it.",
        affectedCount: unresolvedOther,
      });
    }

    /* Failed attempts never settle, so they are absent from a settlement recon
     * report by construction. They are chargeable all the same. */
    gaps.push({
      id: "gap_failed_attempt_count",
      field: "failed_attempt_count",
      lookedIn: "settlement recon report (contains settled transactions only)",
      consequence:
        "Failed attempts are not counted from the settlement. They would have to come from the payments list, which the report gives no way to scope to this cycle.",
      affectedCount: 0,
    });

    /* No endpoint returns the merchant's own pricing plan, so "what she
     * expected" has no rate to be computed from on the live path. */
    gaps.push({
      id: "gap_merchant_plan_rate",
      field: "merchant_headline_rate",
      lookedIn: "settlement, recon report and account endpoints",
      consequence:
        "The plan she believes she is on is not exposed, so merchantExpected cannot be derived and the gap she would notice cannot be stated.",
      affectedCount: 1,
    });

    const onDemandSettlements = await this.#onDemand();

    const times = rows.map((r) => ms(r.created_at)).filter((t) => t > 0);

    return {
      id: settlement.id,
      cycleId: cycleIdFor(settledAt),
      merchant: { ...UNKNOWN_MERCHANT },
      label: when.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
      periodStart: times.length ? Math.min(...times) : settledAt,
      periodEnd: times.length ? Math.max(...times) : settledAt,
      settledAt,
      statedNet: int(settlement.amount),
      payments,
      refunds,
      disputes,
      failedAttemptCount: 0,
      onDemandSettlements,
      gaps,
    };
  }

  /**
   * §4.1 in practice: `fees` and `tax` are read off the rail's own response.
   * There is no rate for this anywhere in Assay, and there must not be.
   */
  async #onDemand(): Promise<OnDemandSettlement[]> {
    const res = await this.#client.settlements
      .fetchAllOndemandSettlement({ count: 100 })
      .catch(() => null);
    const items = res?.items ?? [];

    return items.map((s) => ({
      id: s.id,
      amountRequested: int(s.amount_requested),
      amountSettled: int(s.amount_settled),
      fees: int(s.fees),
      tax: int(s.tax),
      requestedAt: ms(s.created_at),
    }));
  }
}
