import type { CSSProperties } from "react";
import Link from "next/link";
import { EXPLANATION } from "@assay/contract";
import { M, SETTLEMENT_ID } from "./facts";

/**
 * 01 · the credit, and 02 · the expectation.
 *
 * The reference split the headline figure into per-character spans from its
 * own script so each digit could rise on its own delay. Here the spans are
 * rendered, so the animation is a property of the markup rather than of a
 * script that may not have run yet.
 *
 * One line of the reference's copy changed: its chapter mark read "One
 * settlement", which invites a reader to think it is theirs. Meera is
 * constructed and the page says so at the first figure it prints, not only in
 * the footer.
 */

export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-h">
      <div className="wrap ch">
        <div className="ch__m hero__meta">
          <span className="mark">01</span>
          <b>One settlement, constructed</b>
          <br />
          {M.cycle}
        </div>
        <div className="ch__b">
          <h1 className="hero__h" id="hero-h">
            Your settlement arrived.
          </h1>
          <div className="hero__n" id="hero-n" aria-label={M.net}>
            {[...M.net].map((ch, i) => (
              <span className="d" key={i} style={{ "--i": i } as CSSProperties}>
                {ch}
              </span>
            ))}
          </div>
          <p className="hero__s">
            But the number <i>isn’t the explanation.</i>
          </p>
          <div className="hero__acts">
            <Link className="btn" href={`/s/${SETTLEMENT_ID}`}>
              Explore Assay
            </Link>
            <a className="link" href="#expectation">
              <span>Follow the money</span>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M6 1v9M2.8 7L6 10.2 9.2 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
      <div className="hero__foot">
        <div className="wrap">
          <div className="hero__rule" />
        </div>
      </div>
    </section>
  );
}

export function Expectation() {
  return (
    <section className="chap" id="expectation" aria-labelledby="exp-h" data-io>
      <div className="wrap ch">
        <div className="ch__m">
          <span className="mark">02</span>
          <span className="mark__t">The expectation</span>
        </div>
        <div className="ch__b">
          <h2 className="h2" id="exp-h">
            The number you expected was not the number that landed.
          </h2>
          <div className="exp">
            <div className="exp__vals">
              <div className="exp__row exp__row--e">
                <span className="exp__l">You expected</span>
                <span className="exp__v">{M.expected}</span>
                <span className="exp__b">{EXPLANATION.expectationBasis}</span>
              </div>
              <div className="exp__row exp__row--c">
                <span className="exp__l">Credited</span>
                <span className="exp__v">{M.net}</span>
                <span className="exp__b">settled {M.settledAt}</span>
              </div>
            </div>
            <div className="exp__gap" role="group" aria-label="The difference">
              <span className="exp__tick" aria-hidden="true" />
              <span className="exp__gv">{M.gap}</span>
              <span className="exp__gl">unexplained</span>
              <span className="exp__gy">{M.gapAnnual} a year at this rate</span>
            </div>
          </div>
          <p className="p exp__p">
            Nothing here says a rule was broken. It says your arithmetic and the credit disagree by
            a measurable amount — and that is a question of evidence: can every rupee between the
            two numbers be reproduced from what you were given?
          </p>
        </div>
      </div>
    </section>
  );
}
