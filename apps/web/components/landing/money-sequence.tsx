import type { CSSProperties } from "react";
import type { ExplanationLine } from "@assay/contract";
import { count, money, signed } from "@/lib/format";
import { BELOW, KIND, L, M } from "./facts";

/**
 * 03 · follow the money, 04 · the breakpoint, 05 · the gap.
 *
 * Eleven steps scroll past a sticky stage. The director reads `data-step` and
 * `data-body` off these articles and turns the object to face whichever plate
 * the reader has reached; nothing here knows about the scene.
 *
 * Two sentences of the reference's copy changed, both for the same reason: no
 * real gateway was ever called, so a line may not say a rail answered. What is
 * true — and is the stronger claim — is which field each figure came out of.
 */

function Cite({ line }: { line: ExplanationLine }) {
  return <span className={"chip " + KIND[line.citation.kind].chip}>{line.citation.label}</span>;
}

const NotOnReport = () => <span className="chip chip--flag">not on your report</span>;

export function MoneySequence() {
  return (
    <section
      className="seq seq--a"
      id="investigation"
      data-seq="a"
      aria-label="Follow the money"
      style={{ "--n": 11 } as CSSProperties}
    >
      <div className="seq__stage" aria-hidden="true">
        <div className="seq__figure" data-figure />
      </div>
      <div className="seq__steps">
        <article className="step is-active" data-step="0" data-body="">
          <div className="step__in">
            <div className="step__k">
              <span className="mark">03</span>Follow the money
            </div>
            <h3 className="step__label">{L.gross.label}</h3>
            <div className="step__amt n">{money(L.gross.amount)}</div>
            <div className="step__run">
              <span>opening balance</span>
              <b className="n">{money(L.gross.runningBalance)}</b>
            </div>
            <p className="step__p">
              {count(960)} payments captured in August, summed one at a time from{" "}
              <span className="n">payment.amount</span>. Everything below comes off this figure,
              one line at a time.
            </p>
            <div className="step__cite">
              <Cite line={L.gross} />
            </div>
          </div>
        </article>

        <article className="step" data-step="1" data-body="0">
          <div className="step__in">
            <h3 className="step__label">{L.fee.label}</h3>
            <div className="step__amt n">{signed(L.fee.amount)}</div>
            <div className="step__run">
              <span>running balance</span>
              <b className="n">{money(L.fee.runningBalance)}</b>
            </div>
            <p className="step__p">
              <span className="n">{M.rate} × gross captured.</span> A flat plan, applied uniformly
              to every payment instrument.
            </p>
            <div className="step__cite">
              <Cite line={L.fee} />
            </div>
          </div>
        </article>

        <article className="step" data-step="2" data-body="1">
          <div className="step__in">
            <h3 className="step__label">{L.refunds.label}</h3>
            <div className="step__amt n">{signed(L.refunds.amount)}</div>
            <div className="step__run is-expected">
              <span>running balance</span>
              <b className="n">{money(L.refunds.runningBalance)}</b>
            </div>
            <p className="step__p">
              41 refunds settled in the cycle. Gross, less 2%, less refunds: this is the arithmetic
              you did.
            </p>
            <div className="step__cite">
              <Cite line={L.refunds} />
            </div>
          </div>
        </article>

        <article className="step step--break" data-step="3" data-body="plane">
          <div className="step__in">
            <div className="step__k">
              <span className="mark">04</span>The breakpoint
            </div>
            <div className="brk__rule" aria-hidden="true" />
            <div className="brk__eq">
              {M.expected}
              <small>running balance = your expectation</small>
            </div>
            <p className="brk__1">This is where you stopped counting.</p>
            <p className="brk__2">
              Everything below is the <span className="n">{M.gapPlain}</span>.
            </p>
          </div>
        </article>

        <article className="step step--below" data-step="4" data-body="2">
          <div className="step__in">
            <h3 className="step__label">{L.gst.label}</h3>
            <div className="step__amt n">{signed(L.gst.amount)}</div>
            <div className="step__run">
              <span>running balance</span>
              <b className="n">{money(L.gst.runningBalance)}</b>
            </div>
            <p className="step__p">
              <span className="n">18% × gateway fee.</span> Levied on the fee, not on the
              transaction value.
            </p>
            <div className="step__cite">
              <Cite line={L.gst} />
            </div>
          </div>
        </article>

        <article className="step step--below" data-step="5" data-body="3">
          <div className="step__in">
            <h3 className="step__label">{L.failed.label}</h3>
            <div className="step__amt n">{signed(L.failed.amount)}</div>
            <div className="step__run">
              <span>running balance</span>
              <b className="n">{money(L.failed.runningBalance)}</b>
            </div>
            <p className="step__p">
              <span className="n">
                {count(1100)} failed attempts × {M.failedUnit}.
              </span>{" "}
              Charged per authorisation attempt, and itemised on no report you are given.
            </p>
            <div className="step__cite">
              <Cite line={L.failed} />
              <NotOnReport />
            </div>
          </div>
        </article>

        <article className="step step--below" data-step="6" data-body="4">
          <div className="step__in">
            <h3 className="step__label">{L.chargebacks.label}</h3>
            <div className="step__amt n">{signed(L.chargebacks.amount)}</div>
            <div className="step__run">
              <span>running balance</span>
              <b className="n">{money(L.chargebacks.runningBalance)}</b>
            </div>
            <p className="step__p">
              <span className="n">2 disputes × {M.cbPrincipal}.</span> The
              principal of two customer disputes, reversed.
            </p>
            <div className="step__cite">
              <Cite line={L.chargebacks} />
            </div>
          </div>
        </article>

        <article className="step step--below" data-step="7" data-body="5">
          <div className="step__in">
            <h3 className="step__label">{L.cbFees.label}</h3>
            <div className="step__amt n">{signed(L.cbFees.amount)}</div>
            <div className="step__run">
              <span>running balance</span>
              <b className="n">{money(L.cbFees.runningBalance)}</b>
            </div>
            <p className="step__p">
              <span className="n">2 disputes × {M.cbFee}.</span> A handling
              fee for each dispute raised.
            </p>
            <div className="step__cite">
              <Cite line={L.cbFees} />
              <NotOnReport />
            </div>
          </div>
        </article>

        <article className="step step--below" data-step="8" data-body="6">
          <div className="step__in">
            <h3 className="step__label">{L.onDemand.label}</h3>
            <div className="step__amt n">{signed(L.onDemand.amount)}</div>
            <div className="step__run">
              <span>running balance</span>
              <b className="n">{money(L.onDemand.runningBalance)}</b>
            </div>
            <p className="step__p">
              <span className="n">
                settlement.fees {M.instantFees} + settlement.tax {M.instantTax},
              </span>{" "}
              read out of the settlement’s own fields. Assay holds no rate for this line.
            </p>
            <div className="step__cite">
              <Cite line={L.onDemand} />
              <NotOnReport />
            </div>
          </div>
        </article>

        <article className="step" data-step="9" data-body="7">
          <div className="step__in">
            <h3 className="step__label">{L.net.label}</h3>
            <div className="step__amt n">{M.net}</div>
            <div className="step__run">
              <span>gross to net</span>
              <b className="n">{M.deltaSigned}</b>
            </div>
            <p className="step__p">
              The signed sum of the eight lines above. It reconciles to the paisa against the
              credit that landed.
            </p>
            <div className="step__cite">
              <Cite line={L.net} />
            </div>
          </div>
        </article>

        <article className="step step--gap" data-step="10" data-body="gap">
          <div className="step__in">
            <div className="step__k">
              <span className="mark">05</span>The gap
            </div>
            <div className="gap__n">{M.gap}</div>
            <p className="gap__lede">
              The money is accounted for. <i>The explanation isn’t complete.</i>
            </p>
            <ol className="gap__list" aria-label="The five lines below the breakpoint">
              {BELOW.map((l) => (
                <li key={l.id} className={l.onMerchantReport ? undefined : "is-off"}>
                  <span>{l.label}</span>
                  <b className="n">{money(Math.abs(l.amount))}</b>
                </li>
              ))}
              <li className="gap__sum">
                <span>five lines below the breakpoint</span>
                <b className="n">{M.gap}</b>
              </li>
            </ol>
            <p className="gap__foot">
              <span className="star" aria-hidden="true">
                *
              </span>
              Three of the five appear on no report you are given.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
