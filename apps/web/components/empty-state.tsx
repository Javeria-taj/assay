import type { Forecast } from "@assay/contract";

import { ForecastStrip } from "@/components/forecast-strip";
import { money } from "@/lib/format";

/**
 * What the console shows when there is nothing to explain yet — an empty
 * settlement list, or an id no settlement answers to. Ported from the design
 * reference's `renderSystem('empty')` (line 1545) and its `showSystem()`.
 *
 * This is not an error and it does not apologise. Assay explains a settlement
 * after it lands, so before the first one lands there is simply no waterfall to
 * draw, and saying so plainly is the honest screen. The refusal in
 * `unreachable.tsx` is the other case — the API failed and we will not show a
 * figure we cannot stand behind. Both render nothing rather than something
 * partial, for two entirely different reasons.
 *
 * The forecast stays. `showSystem()` in the reference calls `renderForecast()`
 * alongside the system box, and it should: the cycle in progress is the one
 * thing there *is* to look at, and it is what the action points to. Everything
 * in it is labelled as projection, never as a settled figure.
 *
 * Copy is the reference's, character for character.
 */
export function EmptyState({ forecast }: { forecast?: Forecast | null }) {
  return (
    <main id="main" className="page">
      <section className="wrap system" aria-live="polite">
        <div className="system__box">
          <div className="system__k">no settlement yet</div>
          <h2>Nothing has settled yet</h2>
          {/*
            Without a forecast there is no captured-so-far figure, and the rest
            of the sentence quotes one. It is cut at the em dash rather than
            filled with a zero or a guess: the same rule the rest of the product
            runs on, applied to its own copy.
          */}
          <p>
            Assay explains a settlement after it lands. Your first cycle is still collecting
            {forecast ? (
              <>
                {" — the forecast already has "}
                <span className="n">{money(forecast.capturedSoFar, { paise: false })}</span>
                {" of captured payments to work from."}
              </>
            ) : (
              "."
            )}
          </p>
          {forecast ? (
            <div className="system__actions">
              {/*
                An anchor, not a button: the target is a section on this same
                page, which is what a link is for, and it works before any
                JavaScript has run. `#forecast` carries `tabindex="-1"`, so the
                jump moves focus as well as the viewport. The underline is the
                one style added here — `.btn` was written for `<button>`, which
                has none.
              */}
              <a className="btn" href="#forecast" style={{ textDecoration: "none" }}>
                See what is projected to land
              </a>
            </div>
          ) : null}
        </div>
      </section>

      {forecast ? <ForecastStrip forecast={forecast} /> : null}
    </main>
  );
}
