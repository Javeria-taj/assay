import { Fragment } from "react";
import Link from "next/link";
import { HINTS, KIND, LINES, M, SETTLEMENT_ID } from "./facts";
import { money, signed } from "@/lib/format";

/**
 * 12 · the product, and the close.
 *
 * The stack turns to face the reader and its plates land on these rows: the
 * director measures `[data-row]` and flies each plate onto the line it becomes.
 * That is why every row carries the plate index it corresponds to, and why the
 * break row carries `plane` — the object and the ledger are the same drawing
 * seen from two angles.
 *
 * Every row is a button. It opens the drawer with that line's formula, its
 * inputs and the rule it cites.
 */

export function Product() {
  return (
    <section className="seq seq--c" id="product" data-seq="c" aria-labelledby="prod-h">
      <div className="seq__stage">
        <div className="prod">
          <div className="prod__figure" data-figure />
          <div className="prod__right">
            <div className="prod__intro">
              <div className="step__k">
                <span className="mark">12</span>The product
              </div>
              <h2 className="h2" id="prod-h">
                Turn the object to face you.
              </h2>
              <p>
                The plates become lines: one waterfall, nine rows, each citing the rule that
                produced it.
              </p>
            </div>
            <p className="prod__said">The cross-section is the product.</p>
            <div className="prod__ui" id="prod-ui">
              <div className="ui__top">
                <span className="brand">
                  <span className="brand__mark" aria-hidden="true" />
                  Assay
                </span>
                <span className="id">{SETTLEMENT_ID}</span>
                <span className="cyc">{M.cycle}</span>
                <span className="con">constructed scenario</span>
              </div>
              <div className="ui__title">
                <h3>
                  Where the <span className="n">{M.deltaPlain}</span> went
                </h3>
                <span className="sub">9 lines · reconciles to the paisa</span>
              </div>
              <div className="wf__head" aria-hidden="true">
                <span>Line</span>
                <span>Amount</span>
                <span />
                <span>Running</span>
                <span>Cited to</span>
              </div>
              <ol className="wf__list" id="wf">
                {LINES.map((l, i) => {
                  const isGross = i === 0;
                  const isNet = l.kind === "net_credited";
                  const below = i >= 3 && i <= 7;
                  const row = [
                    "wf__row",
                    i === 1 ? "wf__row--unv" : "",
                    below ? "wf__row--gap" : "",
                    isNet ? "wf__row--total" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const ax = [
                    "wf__ax",
                    below ? "wf__ax--gap" : "",
                    isGross ? "wf__ax--first" : "",
                    isNet ? "wf__ax--last wf__ax--net" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <Fragment key={l.id}>
                      {i === 3 && (
                        <li className="wf__break" data-row="plane">
                          <p>
                            This is where you stopped counting. Everything below is the{" "}
                            <span className="n">{M.gapPlain}</span>.
                          </p>
                          <span className="eq">
                            <b>{M.expected}</b> expected balance
                          </span>
                        </li>
                      )}
                      <li>
                        <button className={row} data-line={i} data-row={isGross ? "gross" : i - 1}>
                          <span className="wf__main">
                            <span className="wf__label">{l.label}</span>
                            <span className="wf__hint">{HINTS[l.id]}</span>
                            {!l.onMerchantReport && (
                              <span className="wf__flags">
                                <span className="chip chip--flag">not on your report</span>
                              </span>
                            )}
                          </span>
                          <span className="wf__amt">
                            {isNet ? money(l.runningBalance) : signed(l.amount)}
                          </span>
                          <span className={ax} aria-hidden="true" />
                          <span className={"wf__bal" + (i === 2 ? " is-exp" : "")}>
                            {isNet ? "" : money(l.runningBalance)}
                          </span>
                          <span className="wf__cite">
                            <span className={"chip " + KIND[l.citation.kind].chip}>
                              {l.citation.label}
                            </span>
                          </span>
                        </button>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
              <div className="ui__foot">
                <span>Every row opens its formula, its inputs and the rule it cites.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="cta" id="explore" aria-labelledby="cta-h">
      <div className="wrap ch">
        <div className="ch__m">
          <span className="mark">Assay</span>
          <span className="mark__t">Read-only. It never moves money.</span>
        </div>
        <div className="ch__b">
          <h2 className="h2" id="cta-h">
            See what your settlement is made of.
          </h2>
          <div className="cta__acts">
            <Link className="btn" href={`/s/${SETTLEMENT_ID}`}>
              Explore Assay
            </Link>
            <a className="link" href="#top">
              <span>Back to the credit</span>
            </a>
          </div>
          <p className="cta__note">
            Assay is read-only and never moves money. It decomposes one settlement, cites the rule
            behind each line, and names the fields that would make the rest verifiable.
          </p>
        </div>
      </div>
    </section>
  );
}
