import type { Citation } from "./computed.js";
import type { DisputeWindowData } from "./dispute-window.js";
import type { Paise } from "./policy.js";

/**
 * The discrepancy report, assembled from reconciled lines rather than written.
 *
 * Every claim in the body is machine-checkable and cross-links back to the
 * line that produced it, so the merchant is never asked to send something
 * Assay cannot stand behind.
 */
export type ReportClaim = {
  /** The `ComputedLine.id` this claim restates. */
  lineId: string;
  statement: string;
  amount: Paise;
  citation: Citation;
};

export type DiscrepancyReportData = {
  settlementId: string;
  generatedAt: number;
  window: DisputeWindowData;
  subject: string;
  /** Markdown. Copy and download both use this verbatim. */
  body: string;
  claims: ReportClaim[];
  disputedTotal: Paise;
};
