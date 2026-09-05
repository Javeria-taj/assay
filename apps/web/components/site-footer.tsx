import { CONTRACT_VERSION } from "@assay/contract";
import type { Policy, Reconciliation } from "@assay/contract";
import { money } from "@/lib/format";

/**
 * The colophon. Ported from `renderFooter()` in the design reference, line 1468.
 *
 * Five spans, and none of them are legal boilerplate. The first is the promise
 * the whole product rests on — Assay reads and never writes, so nothing on this
 * screen can move a rupee. The rest are the receipt for what you just read: the
 * contract the response was parsed against, the policy that produced the lines,
 * the human who approved it and when, and the reconciliation delta.
 *
 * That last figure is the one to look at. It is the sum of the signed lines
 * minus what the rail says landed, and it is printed in the footer of every
 * page precisely because it should always be ₹0.00. A build that renders a
 * waterfall which does not close would say so here, in the open, rather than
 * hide the fact behind an assertion that never ran.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `12 Feb 11:00 IST` — the approval stamp without its year, as the reference
 * writes it. Asia/Kolkata, like every other time on the console.
 */
function istStamp(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(epochMs);
  const at = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = at("hour") === "24" ? "00" : at("hour");
  return (
    Number(at("day")) + " " + MONTHS[Number(at("month")) - 1] + " " + hour + ":" + at("minute") + " IST"
  );
}

export type SiteFooterProps = {
  policy: Policy;
  reconciliation: Reconciliation;
  /**
   * The contract this build was compiled against — which is the version the
   * response was actually validated by, so it is read from the package rather
   * than taken on trust from the service that answered.
   */
  contractVersion?: string;
};

export function SiteFooter({
  policy,
  reconciliation,
  contractVersion = CONTRACT_VERSION,
}: SiteFooterProps) {
  return (
    <footer className="foot">
      <div className="wrap foot__in">
        <span>
          <strong>Assay is read-only and never moves money.</strong>
        </span>
        <span className="n">contract {contractVersion}</span>
        <span className="n">
          policy {policy.id} · v{policy.version}
        </span>
        <span className="n">
          approved by {policy.approvedBy}, {istStamp(policy.approvedAt)}
        </span>
        <span className="n">reconciliation.delta {money(reconciliation.delta)}</span>
      </div>
    </footer>
  );
}
