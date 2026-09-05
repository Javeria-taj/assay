import type { Forecast } from "@assay/contract";
import { Eyebrow, Icon } from "@/components/atoms";
import { istTimestamp, money, signed } from "@/lib/format";

/**
 * The cycle that has not settled yet. Below the fold and deliberately quiet:
 * a projection is the one number on this screen that nothing can be checked
 * against, so it is given the least weight of anything here.
 *
 * `backtest.cycles === 0` means the accuracy of this projection has never been
 * measured. It is rendered as exactly that. A "± ₹0" badge would read as
 * perfect accuracy when what it actually encodes is an absent measurement, and
 * a settlement tool that quietly reports an unmeasured error as zero is the
 * failure this product exists to criticise.
 */
export function ForecastStrip({ forecast: f }: { forecast: Forecast }) {
  return (
    <section
      className="wrap forecast"
      id="forecast"
      aria-label="Forecast for the cycle in progress"
      tabIndex={-1}
    >
      <div className="sec-rule" aria-hidden="true" />
      <Eyebrow num="05" label="Next cycle" right="in progress" />

      <div className="forecast__grid">
        <div className="forecast__k">
          {f.cycleId}, still collecting
          <span className="n">
            captured so far {money(f.capturedSoFar)}
            <br />
            settles {istTimestamp(f.expectedSettlementAt)}
          </span>
        </div>

        <div>
          <div className="forecast__v">{money(f.projectedNet)}</div>
          <p className="forecast__note">
            projected credit — the same engine run forward over payments captured so far
          </p>
        </div>

        <div className="forecast__acc">
          {f.backtest.cycles === 0 ? (
            <span className="chip chip--derived">accuracy not yet measured — no backtest has been run</span>
          ) : (
            <span className="chip chip--derived">
              ± {money(f.backtest.medianAbsError)} median · ± {money(f.backtest.maxAbsError)} max
            </span>
          )}
          <span className="n muted" style={{ fontSize: "11px" }}>
            backtest.cycles = {f.backtest.cycles}
          </span>
          <p className="forecast__note">{f.backtest.note}</p>
        </div>
      </div>

      <details className="forecast__more">
        <summary>
          {Icon.chev}
          <span>the {f.projectedLines.length} projected lines, same engine</span>
        </summary>
        <div className="forecast__lines" aria-label="Projected lines">
          {f.projectedLines.map((l) => (
            <div className={"fline" + (l.kind === "net_credited" ? " fline--net" : "")} key={l.id}>
              <span className="id">{l.id}</span>
              <span>
                {l.label}
                <span className="f">{l.basis.formula}</span>
              </span>
              <span className="n">
                {l.kind === "net_credited" ? money(l.runningBalance) : signed(l.amount)}
              </span>
              <span className="n bal">{l.kind === "net_credited" ? "" : money(l.runningBalance)}</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
