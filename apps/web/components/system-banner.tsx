"use client";

import { useRef, useState } from "react";
import { CONTRACT_VERSION } from "@assay/contract";
import { Icon } from "@/components/atoms";
import { money } from "@/lib/format";

/**
 * The system strip. Ported from `renderSystem()` in the design reference,
 * line 1532.
 *
 * This is the console in a degraded condition, and there are exactly two of
 * them, because there are exactly two ways a settlement screen can have nothing
 * to say.
 *
 * `contract` is a refusal. The API answered, the shape did not match the
 * contract, and rather than render the lines it could parse and quietly drop
 * the one it could not, Assay renders none of them and prints the failing paths
 * instead. A waterfall missing a line still sums to something; it just sums to
 * the wrong number, and a merchant has no way to tell. Showing a partial
 * breakdown is worse than showing none.
 *
 * `no_settlement` is not a failure at all. Assay explains a settlement after it
 * lands, so a first cycle that is still collecting has nothing to explain yet —
 * and the strip says exactly that, then points at the forecast, which does have
 * something to work from.
 */

export type Diagnostic = {
  /** The field path the contract rejected, e.g. `lines.7.citation.sourceId`. */
  path: string;
  /** What it said about it, e.g. `Required`. */
  message: string;
};

export type SystemBannerProps =
  | {
      kind: "contract";
      /** The call that came back wrong. */
      operation?: string;
      contractVersion?: string;
      /** The parser's own complaints. Never invented, never summarised. */
      diagnostics?: Diagnostic[];
      onRetry?: () => void;
    }
  | {
      kind: "no_settlement";
      /** Captured so far in the open cycle, in integer paise. */
      capturedSoFar: number;
      onSeeForecast?: () => void;
    };

export function SystemBanner(props: SystemBannerProps) {
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef(0);

  const say = (msg: string) => {
    setNote(msg);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2600);
  };

  if (props.kind === "contract") {
    const {
      operation = "getExplanation",
      contractVersion = CONTRACT_VERSION,
      diagnostics = [],
      onRetry,
    } = props;

    /* What the clipboard gets is what the box shows: the same lines, in the
     * same order, so a diagnostic pasted into an issue is the diagnostic that
     * was on screen. */
    const diagText = [
      operation + " · contract " + contractVersion,
      ...diagnostics.map((d) => d.path + " " + d.message),
    ].join("\n");

    const onCopy = async () => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(diagText);
        ok = true;
      } catch {
        ok = false;
      }
      say(ok ? "Diagnostics copied." : "Copy did not work here.");
    };

    return (
      <>
        <section className="wrap system" aria-live="polite">
          <div className="system__box system__box--neg" role="alert">
            <div className="system__k">contract check failed</div>
            <h2>Assay will not show you a number it cannot stand behind</h2>
            <p>
              The settlement came back in a shape this build does not recognise, so the waterfall
              was not rendered. Showing a partial breakdown here would be worse than showing none.
            </p>

            <div className="diag">
              <div>
                <b>{operation}</b> <span className="k">· contract {contractVersion}</span>
              </div>
              {diagnostics.map((d, i) => (
                <div key={i}>
                  <span className="k">{d.path}</span> <span className="e">{d.message}</span>
                </div>
              ))}
            </div>

            <div className="system__actions">
              <button
                type="button"
                className="btn"
                onClick={() => (onRetry ? onRetry() : window.location.reload())}
              >
                Retry
              </button>
              <button type="button" className="btn btn--ghost" onClick={onCopy}>
                {Icon.copy}Copy diagnostics
              </button>
            </div>
          </div>
        </section>

        <Toast note={note} />
      </>
    );
  }

  const { capturedSoFar, onSeeForecast } = props;

  return (
    <section className="wrap system" aria-live="polite">
      <div className="system__box">
        <div className="system__k">no settlement yet</div>
        <h2>Nothing has settled yet</h2>
        <p>
          Assay explains a settlement after it lands. Your first cycle is still collecting — the
          forecast already has <span className="n">{money(capturedSoFar, { paise: false })}</span> of
          captured payments to work from.
        </p>
        <div className="system__actions">
          <button
            type="button"
            className="btn"
            onClick={() => (onSeeForecast ? onSeeForecast() : goForecast())}
          >
            See what is projected to land
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * The reference's `goForecast()`, line 1851: scroll it into view, restart the
 * flash so a second press is visible, and take focus once the scroll has
 * landed — the strip carries `tabindex="-1"` for exactly this.
 */
function goForecast() {
  const f = document.getElementById("forecast");
  if (!f) return;
  f.scrollIntoView({ behavior: "smooth", block: "start" });
  f.classList.remove("forecast--focus");
  void f.offsetWidth;
  f.classList.add("forecast--focus");
  window.setTimeout(() => f.focus({ preventScroll: true }), 500);
}

function Toast({ note }: { note: string | null }) {
  return (
    <div className={"toast" + (note ? " is-on" : "")} role="status" aria-live="polite">
      {note ? (
        <>
          {Icon.check}
          <span>{note}</span>
        </>
      ) : null}
    </div>
  );
}
