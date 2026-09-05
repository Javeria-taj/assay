import type { Explanation } from "@assay/contract";

import { Digits, Eyebrow, Icon } from "@/components/atoms";
import { count, istTimestamp, money } from "@/lib/format";

/**
 * The verdict. Ported from `renderVerdict()` in the design reference.
 *
 * One anchor figure, one mental model, one unresolved delta, in that order and
 * no other: what landed, what she expected, and what she cannot explain. Only
 * the delta carries amber, and the amber continues into the rule beneath it.
 *
 * Nothing here is interactive and nothing here ticks, so it stays a server
 * component: the figures arrive with the document, already correct.
 */

/**
 * `₹1.81L`. The reference's own annualisation format, kept here because
 * `lib/format.ts` has no lakhs helper and that file is not ours to edit.
 * Integer paise are rounded to whole lakhs-hundredths before the divide.
 */
const lakhs = (paise: number): string => "₹" + (Math.round(paise / 100_000) / 100).toFixed(2) + "L";

export function Verdict({ explanation: x }: { explanation: Explanation }) {
  /**
   * The trace count is measured, not typed: how many lines have already carried
   * the balance below what she expected. Same predicate as the waterfall's
   * break, so the two always agree.
   */
  const belowBreak = x.lines.filter(
    (l) => l.kind !== "net_credited" && l.runningBalance < x.merchantExpected,
  ).length;

  /* L-00 is `gross_captured` and always carries its count; the contract types
   * it nullable because per-event counts are absent on ad-valorem lines. */
  const capturedCount = x.lines[0].count ?? 0;

  return (
    <section className="wrap verdict" id="verdict" aria-label="Settlement verdict">
      <Eyebrow num="01" label="Settlement" right={x.settlementId + " · " + x.cycleLabel} />
      <div className="verdict__grid">
        <div className="fig fig--landed">
          <div className="fig__label">Landed in your account</div>
          <div className="fig__value" aria-label={money(x.netCredited)}>
            <Digits value={money(x.netCredited)} offsetMs={0} />
          </div>
          <div className="fig__meta">settled {istTimestamp(x.settledAt)} · {count(capturedCount)} captured payments</div>
        </div>
        <div className="verdict__side">
          <div className="fig fig--expected">
            <div className="fig__label">You expected</div>
            <div className="fig__value" aria-label={money(x.merchantExpected)}>
              <Digits value={money(x.merchantExpected)} offsetMs={190} />
            </div>
            <div className="fig__meta">{x.expectationBasis}</div>
          </div>
          <div className="fig fig--gap">
            <div className="fig__label">You cannot explain</div>
            <div className="fig__value" aria-label={money(x.unexplainedGap)}>
              <Digits value={money(x.unexplainedGap)} offsetMs={340} />
            </div>
            <div className="fig__meta">≈ {lakhs(x.unexplainedGap * 12)} a year</div>
            <div className="fig__trace">
              {Icon.down}
              <span>traced across {belowBreak} lines below</span>
            </div>
          </div>
        </div>
      </div>
      <div className="verdict__rule" aria-hidden="true">
        <span></span>
        <span className="amber"></span>
      </div>
    </section>
  );
}
