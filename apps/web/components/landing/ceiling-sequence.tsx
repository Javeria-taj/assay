import type { CSSProperties } from "react";
import { CEIL, KIND, L, M, MISSING, MISSING_SUM } from "./facts";

/**
 * 06 · reconciled, then 07 · the explainability ceiling and 08 · three missing
 * fields.
 *
 * The two bars are the finding: they are computed independently and never
 * merged, because "every rupee adds up" and "every rupee can be checked" are
 * different questions and the second one is the one nobody asks. The three
 * fields below them partition the unverifiable third exactly — the ceiling
 * derives them from the instrument mix rather than naming three numbers that
 * happen to sum.
 */

export function Reconciled() {
  return (
    <section className="recon" id="reconciled" aria-labelledby="recon-h" data-recon>
      <div className="recon__stage">
        <div className="wrap ch">
          <div className="ch__m">
            <span className="mark">06</span>
            <span className="mark__t">Reconciled</span>
          </div>
          <div className="ch__b">
            <h2 className="recon__pct" id="recon-h">
              <span className="n">{CEIL.reconciledPct}</span> reconciled
            </h2>
            <p className="recon__s">Every rupee reconciles.</p>
            <div className="recon__twist">
              <p className="recon__t">But reconciliation is not verification.</p>
              <p className="recon__note">
                Reconciliation asks whether the lines sum to the credit. Verification asks whether
                you could reproduce each line from the fields you were actually given. Assay
                answers both, and keeps them apart.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function CeilingSequence() {
  return (
    <section
      className="seq seq--b"
      id="ceiling"
      data-seq="b"
      aria-label="The explainability ceiling"
      style={{ "--n": 7 } as CSSProperties}
    >
      <div className="seq__stage" aria-hidden="true">
        <div className="seq__figure" data-figure />
      </div>
      <div className="seq__steps">
        <article className="step is-active" data-step="0" data-body="0">
          <div className="step__in">
            <div className="step__k">
              <span className="mark">07</span>The explainability ceiling
            </div>
            <h3 className="step__hi">
              Two questions of the same <span className="n">{M.deltaPlain}</span>.
            </h3>
            <div className="bars">
              <div className="bar">
                <div className="bar__pct n">{CEIL.reconciledPct}</div>
                <div className="bar__l">
                  <span>Amount reconciles</span>
                  <b className="n">{M.delta}</b>
                </div>
                <div
                  className="bar__t"
                  role="img"
                  aria-label={"Amount reconciles, " + CEIL.reconciledPct}
                >
                  <i style={{ width: "100%" }} />
                </div>
              </div>
              <div className="bar">
                <div className="bar__pct n">{CEIL.verifiablePct}</div>
                <div className="bar__l">
                  <span>Basis independently verifiable</span>
                  <b className="n">{M.verifiable}</b>
                </div>
                <div
                  className="bar__t"
                  role="img"
                  aria-label={
                    "Basis verifiable " +
                    CEIL.verifiablePct +
                    ", unverifiable " +
                    CEIL.unverifiablePct
                  }
                >
                  <i style={{ width: CEIL.verifiableWidth }} />
                  <u style={{ width: CEIL.unverifiableWidth }} />
                </div>
                <div className="bar__f">
                  <span className="n">
                    {CEIL.unverifiablePct} · {M.unverifiable} with no evidence path
                  </span>
                </div>
              </div>
            </div>
            <p className="ceil__h">
              Every rupee reconciles.{" "}
              <em>
                <span className="n">{M.unverifiablePlain}</span> of it —{" "}
                <span className="n">{CEIL.unverifiablePct}</span> —
              </em>{" "}
              you have no way to check.
            </p>
          </div>
        </article>

        <article className="step" data-step="1" data-body="0">
          <div className="step__in">
            <h3 className="step__hi">
              <span className="n">{M.unverifiablePlain}</span> has no evidence path.
            </h3>
            <p className="step__p">
              The gateway fee is exactly what the plan says. It is also levied across five rails
              carrying different statutory network MDR, and three of them reach your report
              labelled identically as <span className="n">UPI</span>. Nothing you are given lets
              you check which rupee sat on which rail.
            </p>
            <div className="step__cite">
              <span className="chip chip--warn">basis not verifiable</span>
              <span className={"chip " + KIND[L.fee.citation.kind].chip}>
                {L.fee.citation.label}
              </span>
            </div>
          </div>
        </article>

        <article className="step" data-step="2" data-body="slots">
          <div className="step__in">
            <div className="step__k">
              <span className="mark">08</span>Three missing fields
            </div>
            <h3 className="step__hi">Three fields would close it.</h3>
            <p className="step__p">
              They do not overlap, and they sum to the whole{" "}
              <span className="n">{M.unverifiablePlain}</span>. Each absence has a value.
            </p>
            <ol className="fields" id="fields" aria-label="The three missing fields">
              {MISSING.map((f, i) => (
                <li key={f.id} data-slot={i}>
                  <span>{f.name}</span>
                  <b className="n">{f.amount}</b>
                </li>
              ))}
              <li className="fields__sum">
                <span>would resolve</span>
                <b className="n">{M.unverifiablePlain}</b>
              </li>
            </ol>
          </div>
        </article>

        <article className="step" data-step="3" data-body="slot-0">
          <div className="step__in">
            <div className="field">
              <h3 className="field__name">{MISSING[0].name}</h3>
              <span className="field__amt">{MISSING[0].amount}</span>
              <span className="field__k">no field in any report you receive</span>
            </div>
            <p className="step__p">
              Bank-account UPI carries 0% network MDR by statute, RuPay credit on UPI around 2%,
              and PPI on UPI 1.1% above ₹2,000. All three arrive in your report labelled
              identically as “UPI”, so no merchant can check which rail carried which rupee.
            </p>
          </div>
        </article>

        <article className="step" data-step="4" data-body="slot-1">
          <div className="step__in">
            <div className="field">
              <h3 className="field__name">{MISSING[1].name}</h3>
              <span className="field__amt">{MISSING[1].amount}</span>
              <span className="field__k">no field in any report you receive</span>
            </div>
            <p className="step__p">
              Debit, credit, commercial and international BINs carry materially different
              interchange, and the tier is not surfaced on your report. The card slice of the fee
              cannot be checked against any published rate.
            </p>
          </div>
        </article>

        <article className="step" data-step="5" data-body="slot-2">
          <div className="step__in">
            <div className="field">
              <h3 className="field__name">{MISSING[2].name}</h3>
              <span className="field__amt">{MISSING[2].amount}</span>
              <span className="field__k">no field in any report you receive</span>
            </div>
            <p className="step__p">
              Each fee line states an amount but not the base it was computed on. An ad-valorem
              charge and a flat per-transaction one look identical, and neither can be verified.
            </p>
          </div>
        </article>

        <article className="step" data-step="6" data-body="slots">
          <div className="step__in">
            <h3 className="step__hi">The missing information is not abstract. It has a value.</h3>
            <p className="step__p">
              <span className="n">{MISSING_SUM}.</span> Three fields, no overlap. Assay names them
              so they can be asked for.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
