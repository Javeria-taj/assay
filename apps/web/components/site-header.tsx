"use client";

import { useEffect, useRef, useState } from "react";
import type { Explanation } from "@assay/contract";

/**
 * The contract exports `Merchant` as a schema, not as a type, so the merchant
 * is taken off the explanation it belongs to rather than re-declared here —
 * which keeps it exactly the shape the parser produced.
 */
type Merchant = Explanation["merchant"];

/**
 * The masthead. Ported from the design reference — the markup at lines 786-809
 * and `renderHeader()` at line 1167 — with the two menus rebuilt as state
 * rather than as `hidden` attributes toggled by a delegated click handler.
 *
 * Two controls live here and both of them are real.
 *
 * The cycle selector is a listbox. It may hold a single cycle — this build
 * explains one settlement at a time — but it opens, closes on Escape and on a
 * click outside, and hands focus back to the button it came from, because a
 * control that looks like a menu and is not one is a lie about what the screen
 * can do.
 *
 * The constructed badge is the more important of the two. It is the only place
 * on the console that says out loud what the numbers are: Meera is built, her
 * volumes were chosen, and Assay has never been pointed at anybody's real
 * statement. The arithmetic is correct and every rule under it is real — those
 * two claims ship together or the screen is dishonest. That is a truthfulness
 * requirement, not a decoration, so the badge is a button and the note behind
 * it is written out in full.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `12 Feb 2026`, or `6 Sep` without the year. Asia/Kolkata, always.
 *
 * `lib/format.ts` renders the full stamp with the time on it, which is what the
 * window strip and the footer need; the menu rows drop the clock, so the
 * date-only form is built here rather than by editing a shared module this
 * stream does not own.
 */
function istDay(epochMs: number, opts: { year?: boolean } = {}): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(epochMs);
  const at = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = Number(at("day"));
  const month = MONTHS[Number(at("month")) - 1];
  return day + " " + month + (opts.year === false ? "" : " " + at("year"));
}

/** The cycle that is still collecting. Listed, never selectable. */
export type NextCycle = {
  cycleLabel: string;
  expectedSettlementAt: number;
};

export type SiteHeaderProps = {
  settlementId: string;
  cycleLabel: string;
  /** Carries `constructed: true`, plus the id and segment the note prints. */
  merchant: Merchant;
  /** When the settled cycle landed, for the `settled 12 Feb 2026` row. */
  settledAt?: number;
  /** The open cycle, if there is one to name. Rendered disabled. */
  nextCycle?: NextCycle | null;
};

type MenuName = "cycle" | "constructed";

export function SiteHeader({
  settlementId,
  cycleLabel,
  merchant,
  settledAt,
  nextCycle,
}: SiteHeaderProps) {
  const [open, setOpen] = useState<MenuName | null>(null);
  const cycleBtn = useRef<HTMLButtonElement>(null);
  const constructedBtn = useRef<HTMLButtonElement>(null);
  const cycleList = useRef<HTMLUListElement>(null);

  /* Escape closes, and a click anywhere that is not inside a `.menu` closes.
   * Both listeners exist only while something is open, so the header is inert
   * for the whole time nothing is. */
  useEffect(() => {
    if (!open) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".menu")) return;
      setOpen(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(null);
      /* Focus goes back to the control that opened it, or it is lost to the
       * top of the document and a keyboard user has to start again. */
      (open === "cycle" ? cycleBtn : constructedBtn).current?.focus();
    };

    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /* Opening the listbox moves focus into it, as the reference does. The note
   * has nothing focusable inside it, so focus stays on the badge. */
  useEffect(() => {
    if (open !== "cycle") return;
    cycleList.current?.querySelector("button")?.focus();
  }, [open]);

  const toggle = (name: MenuName) => setOpen((current) => (current === name ? null : name));

  /* Picking the cycle already on screen is a no-op that closes the menu; the
   * one still collecting cannot be picked at all. Either way focus returns. */
  const pick = () => {
    setOpen(null);
    cycleBtn.current?.focus();
  };

  return (
    <>
      <a className="skip" href="#main">
        Skip to the settlement
      </a>

      <header className="top">
        <div className="wrap top__inner">
          <a className="brand" href="#main" aria-label="Assay">
            <span className="brand__mark" aria-hidden="true" />
            Assay
          </a>

          <div className="top__meta">
            <span className="n top__id" aria-label="Settlement id">
              {settlementId}
            </span>

            <div className="menu">
              <button
                ref={cycleBtn}
                type="button"
                className="menu__btn"
                id="cycle-btn"
                aria-haspopup="listbox"
                aria-expanded={open === "cycle"}
                aria-controls="cycle-list"
                aria-label="Settlement cycle"
                onClick={() => toggle("cycle")}
              >
                <span>{cycleLabel}</span>
                <svg viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>

              <ul
                ref={cycleList}
                className="menu__list"
                id="cycle-list"
                role="listbox"
                aria-labelledby="cycle-btn"
                hidden={open !== "cycle"}
              >
                <li>
                  <button
                    type="button"
                    className="menu__item"
                    role="option"
                    aria-selected="true"
                    onClick={pick}
                  >
                    <span>
                      <span className="dot" aria-hidden="true" />
                      {cycleLabel}
                    </span>
                    {settledAt != null ? (
                      <span className="n">settled {istDay(settledAt)}</span>
                    ) : null}
                  </button>
                </li>

                {nextCycle ? (
                  <li>
                    <button
                      type="button"
                      className="menu__item"
                      role="option"
                      aria-selected="false"
                      aria-disabled="true"
                      onClick={pick}
                    >
                      <span>
                        <span className="dot" aria-hidden="true" />
                        {nextCycle.cycleLabel}
                      </span>
                      <span className="n">
                        in progress · settles{" "}
                        {istDay(nextCycle.expectedSettlementAt, { year: false })}
                      </span>
                    </button>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>

          <div className="top__right">
            <span className="top__ro">read-only</span>

            <div className="menu">
              <button
                ref={constructedBtn}
                type="button"
                className="constructed__btn"
                id="constructed-btn"
                aria-expanded={open === "constructed"}
                aria-controls="constructed-pop"
                onClick={() => toggle("constructed")}
              >
                <span className="ring" aria-hidden="true" />
                <span className="t">
                  constructed<span className="t2"> scenario</span>
                </span>
                <span className="sr-only">constructed scenario. Open the note.</span>
              </button>

              <div
                className="pop"
                id="constructed-pop"
                role="region"
                aria-label="About this scenario"
                hidden={open !== "constructed"}
              >
                <div className="pop__h">
                  constructed scenario · every rule real, every volume chosen
                </div>
                <p>
                  {merchant.name}, her volumes, her instrument mix and her plan are constructed, to
                  show scale at a believable Indian SMB.
                </p>
                <p>
                  Every rule on this screen traces to a published source: a statute, the terms, or a
                  field the rail returns.{" "}
                  <strong>The arithmetic is correct. The scenario is built.</strong> Both statements
                  ship.
                </p>
                <p>
                  {
                    "Assay is gateway-agnostic, runs on synthetic data, and is never pointed at a named provider's real statement."
                  }
                </p>
                <p className="n">
                  merchant.constructed = {String(merchant.constructed)} · {merchant.id} ·{" "}
                  {merchant.segment}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
