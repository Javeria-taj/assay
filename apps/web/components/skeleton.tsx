import type { CSSProperties } from "react";

import { Eyebrow } from "@/components/atoms";

/**
 * The console while it is still being fetched. Ported from the design
 * reference's `skeletonVerdict/Window/Waterfall/Ceiling/Forecast` (lines
 * 1478-1531) and its `showLoading()`.
 *
 * The reference states the rule in its own comment above those functions: "No
 * spinners. The skeleton is the final geometry, drained of its numbers." So
 * this is not a placeholder screen — it is the console's exact DOM, the same
 * sections in the same order carrying the same class names, with every figure
 * replaced by a block of the height that figure will occupy. Nothing moves when
 * the data lands; the grey simply becomes numbers.
 *
 * That matters here more than it would elsewhere. The product's claim is that
 * the money reconciles, and a waterfall whose rows pop in one at a time, each
 * shifting the nine below it, undercuts the claim before a single figure has
 * been read.
 *
 * No styling is added. `.sk` and its `shimmer` keyframes are already in
 * `assay.css` (lines 510-515), including the `prefers-reduced-motion` opt-out,
 * so the placeholders inherit the real thing rather than a second copy of it.
 * The only inline styles are the reference's own per-block width and height.
 *
 * A server component: it renders once, holds still, and is replaced.
 */

/**
 * One drained figure. `w`/`h` are the reference's two positional arguments;
 * `style` is its third, the occasional margin, as an object rather than a CSS
 * string because this is JSX.
 */
function Sk({ w, h, style }: { w: string; h: string; style?: CSSProperties }) {
  return <span className="sk" style={{ width: w, height: h, ...style }} />;
}

/* Nine lines, because the trace is always nine lines: eight movements and the
 * net. The skeleton has to be the right length or the page still jumps. */
const ROWS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/* Three evidence requests, matching the reference's `[0, 1, 2].map`. */
const EVIDENCE = [0, 1, 2];

/* ------------------------------------------------------------------ zones */

export function VerdictSkeleton() {
  return (
    <section className="wrap verdict" id="verdict" aria-label="Settlement verdict">
      <Eyebrow num="01" label="Settlement" />
      <div className="verdict__grid">
        <div className="fig fig--landed">
          <Sk w="170px" h="14px" style={{ marginBottom: "12px" }} />
          <Sk w="min(560px,94%)" h="84px" />
          <Sk w="280px" h="12px" style={{ marginTop: "14px" }} />
        </div>
        <div className="verdict__side">
          <div className="fig fig--expected">
            <Sk w="96px" h="13px" style={{ marginBottom: "10px" }} />
            <Sk w="88%" h="38px" />
            <Sk w="140px" h="12px" style={{ marginTop: "12px" }} />
          </div>
          <div className="fig fig--gap">
            <Sk w="140px" h="13px" style={{ marginBottom: "10px" }} />
            <Sk w="72%" h="52px" />
            <Sk w="120px" h="12px" style={{ marginTop: "12px" }} />
          </div>
        </div>
      </div>
      {/* Both halves neutral: the amber half of the rule is a finding, and
          there is no finding yet. */}
      <div className="verdict__rule" aria-hidden="true">
        <span style={{ background: "var(--rule)" }} />
        <span style={{ background: "var(--rule)" }} />
      </div>
    </section>
  );
}

export function WindowSkeleton() {
  return (
    <section className="wrap window" id="window" aria-label="Discrepancy reporting window">
      <Eyebrow num="02" label="Reporting window" />
      <div className="strip" style={{ borderTopColor: "var(--rule-2)" }} aria-busy="true">
        <div>
          <Sk w="240px" h="40px" />
          <Sk w="300px" h="12px" style={{ marginTop: "14px" }} />
        </div>
        <div>
          <Sk w="94%" h="13px" />
          <Sk w="72%" h="13px" style={{ marginTop: "9px" }} />
          <Sk w="110px" h="22px" style={{ marginTop: "12px" }} />
        </div>
        <div className="strip__cta">
          <Sk w="222px" h="44px" />
        </div>
      </div>
    </section>
  );
}

export function WaterfallSkeleton() {
  return (
    <section className="wf" id="waterfall" aria-label="Where the money went">
      <Eyebrow num="03" label="The trace" />
      <div className="wf__title">
        <h2>
          <Sk w="320px" h="26px" />
        </h2>
        <span className="sub">
          <Sk w="170px" h="12px" />
        </span>
      </div>
      {/* The column headings are real: they are the layout, not the data. */}
      <div className="wf__head" aria-hidden="true">
        <span>Ref</span>
        <span>Line item · basis</span>
        <span>Amount</span>
        <span></span>
        <span>Running balance</span>
        <span>Cited to</span>
        <span></span>
      </div>
      <ol className="wf__list" aria-busy="true">
        {ROWS.map((i) => (
          <li key={i}>
            {/* A div, not a button: there is nothing to open yet. */}
            <div className="row" style={{ cursor: "default" }}>
              <span>
                <Sk w="30px" h="11px" />
              </span>
              <span>
                <Sk w={i % 3 === 0 ? "62%" : "46%"} h="15px" />
                <Sk w="34%" h="11px" style={{ marginTop: "8px" }} />
              </span>
              <span>
                <Sk w="100%" h="16px" />
              </span>
              {/* The running axis is drawn even now, so the spine of the trace
                  is already in place when the rows fill in. */}
              <span
                className={
                  "ax" +
                  (i === 0 ? " ax--first" : "") +
                  (i === ROWS.length - 1 ? " ax--last" : "")
                }
              />
              <span>
                <Sk w="92%" h="13px" />
              </span>
              <span>
                <Sk w="94px" h="22px" />
              </span>
              <span></span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CeilingSkeleton() {
  return (
    <aside className="ceiling" id="ceiling" aria-label="What you can actually check">
      <Eyebrow num="04" label="Explainability ceiling" />
      {/* The two questions are the panel's argument, not its data, so they are
          stated in full while the measurements are still missing. */}
      <h2>What you can actually check</h2>
      <p className="ceiling__lede">
        Two different questions. The first is arithmetic. The second is evidence.
      </p>

      <div className="axis1">
        <div className="axis1__lab">
          <Sk w="120px" h="13px" />
          <Sk w="106px" h="13px" />
        </div>
        <div className="axis1__bar" />
        <div className="axis1__foot">
          <Sk w="140px" h="11px" />
          <Sk w="130px" h="11px" />
        </div>
      </div>

      <div className="axis1__lab" style={{ margin: "26px 0 0" }}>
        <Sk w="104px" h="13px" />
        <Sk w="112px" h="13px" />
      </div>

      <div className="ceil">
        <div className="ceil__col" />
        <div className="ceil__notes">
          <div className="ceil__note ceil__note--top">
            <Sk w="180px" h="11px" />
            <Sk w="150px" h="16px" style={{ marginTop: "6px" }} />
            <Sk w="100%" h="11px" style={{ marginTop: "8px" }} />
          </div>
          <div className="ceil__note ceil__note--bottom">
            <Sk w="150px" h="11px" />
            <Sk w="140px" h="16px" style={{ marginTop: "6px" }} />
            <Sk w="100%" h="11px" style={{ marginTop: "8px" }} />
          </div>
        </div>
      </div>

      <div className="ceiling__headline" style={{ borderTopColor: "var(--rule)" }}>
        <Sk w="100%" h="19px" />
        <Sk w="76%" h="19px" style={{ marginTop: "10px" }} />
      </div>

      <div className="ev">
        {EVIDENCE.map((i) => (
          <div className="ev__item" key={i}>
            <span>
              <Sk w="24px" h="11px" />
            </span>
            <span>
              <Sk w="150px" h="15px" />
            </span>
            <span>
              <Sk w="66px" h="14px" />
            </span>
            <p className="ev__why">
              <Sk w="100%" h="11px" />
              <Sk w="84%" h="11px" style={{ marginTop: "6px" }} />
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function ForecastSkeleton() {
  return (
    <section
      className="wrap forecast"
      id="forecast"
      aria-label="Forecast for the cycle in progress"
      tabIndex={-1}
    >
      <div className="sec-rule" aria-hidden="true" />
      <Eyebrow num="05" label="Next cycle" />
      <div className="forecast__grid">
        <div>
          <Sk w="180px" h="14px" />
          <Sk w="220px" h="12px" style={{ marginTop: "10px" }} />
        </div>
        <div>
          <Sk w="230px" h="32px" />
          <Sk w="320px" h="12px" style={{ marginTop: "12px" }} />
        </div>
        <div>
          <Sk w="260px" h="24px" />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- screen */

/**
 * The whole console, drained. Mirrors `Console` element for element, header
 * included: the header carries the settlement id and the cycle, and a header
 * that arrived a moment after the rest would push all five zones down the page.
 *
 * The brand, the read-only mark and the constructed-scenario badge are facts
 * about the build rather than about the settlement, so they are shown outright.
 * Only the two pieces that come from the API are drained.
 */
export function ConsoleSkeleton() {
  return (
    <>
      <header className="top">
        <div className="wrap top__inner">
          <a className="brand" href="#main" aria-label="Assay">
            <span className="brand__mark" aria-hidden="true" />
            Assay
          </a>
          <div className="top__meta">
            <span className="n top__id" aria-label="Settlement id">
              <Sk w="128px" h="12px" />
            </span>
            <div className="menu">
              <span className="menu__btn" aria-label="Settlement cycle">
                <span>
                  <Sk w="104px" h="13px" />
                </span>
              </span>
            </div>
          </div>
          <div className="top__right">
            <span className="top__ro">read-only</span>
            <div className="menu">
              <span className="constructed__btn">
                <span className="ring" aria-hidden="true" />
                <span className="t">
                  constructed<span className="t2"> scenario</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="page" aria-busy="true">
        <VerdictSkeleton />
        <WindowSkeleton />

        <div className="wrap cols">
          <WaterfallSkeleton />
          <CeilingSkeleton />
        </div>

        <ForecastSkeleton />
      </main>
    </>
  );
}
