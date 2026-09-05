import Link from "next/link";
import { M, SETTLEMENT_ID } from "./facts";

/**
 * The two pieces of chrome the investigation hangs between.
 *
 * The nav's call to action goes to the console — the same settlement, taken
 * apart line by line — rather than to a marketing shell. It is the only
 * outbound link on the page.
 */

export function Nav() {
  return (
    <header className="nav" id="nav">
      <div className="wrap nav__in">
        <a className="brand" href="#top" aria-label="Assay, top of page">
          <span className="brand__mark" aria-hidden="true" />
          Assay
        </a>
        <nav className="nav__links" aria-label="Sections">
          <a href="#investigation">Investigation</a>
          <a href="#method">Method</a>
          <a href="#product">Product</a>
        </nav>
        <div className="nav__cta">
          <Link className="btn" href={`/s/${SETTLEMENT_ID}`}>
            Explore Assay
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Foot() {
  return (
    <footer className="foot">
      <div className="wrap foot__in">
        <span>
          <strong>Assay</strong> tells you what your settlement is actually made of.
        </span>
        <span>
          The settlement shown is a constructed scenario: every rule real, every volume chosen.
        </span>
        <span className="n">
          {SETTLEMENT_ID} · {M.cycle}
        </span>
      </div>
    </footer>
  );
}
