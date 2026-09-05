"use client";

import type { DisputeWindow } from "@assay/contract";

import { Chip, Eyebrow } from "@/components/atoms";
import { elapsed, istTimestamp, money, remaining } from "@/lib/format";
import { useServerClock } from "@/lib/use-server-clock";

/**
 * The reporting window. Ported from `renderWindow()` and `rulerHTML()` in the
 * design reference.
 *
 * Three states, and the difference between them is the difference between a
 * right she still holds and one she no longer does: `open` is neutral,
 * `closing` is elevated, `expired` is the strongest state on the product.
 *
 * The countdown runs off `useServerClock(window.serverNow)`. Never the
 * browser's clock: this number tells a merchant whether a contractual right is
 * still hers, and a laptop an hour out would quietly tell her the wrong thing.
 * The status is re-derived from the ticking remainder too, so a window that
 * crosses its threshold or its deadline while she is looking at it changes on
 * screen without a reload.
 */

/* ------------------------------------------------------------------- time */

/**
 * IST in the shapes the strip needs. `lib/format.ts` owns the full form
 * (`6 Sep 2026, 11:00 IST`) and is used for it below; the ruler labels and the
 * live server clock need the year dropped, the comma dropped, seconds added or
 * the month spelt out, so those shapes are ported from the reference's own
 * `fmtIST` rather than approximated with the one form.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const istFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function istParts(ms: number) {
  const o: Record<string, string> = {};
  istFmt.formatToParts(new Date(ms)).forEach((p) => {
    o[p.type] = p.value;
  });
  return {
    d: +o.day,
    m: +o.month - 1,
    y: +o.year,
    hh: o.hour === "24" ? "00" : o.hour,
    mm: o.minute,
    ss: o.second,
  };
}

type IstOpts = { year?: boolean; time?: boolean; comma?: boolean; seconds?: boolean; long?: boolean };

function ist(ms: number, o: IstOpts = {}): string {
  const p = istParts(ms);
  const year = o.year !== false;
  const time = o.time !== false;
  const comma = o.comma != null ? o.comma : year;
  let s = p.d + " " + (o.long ? MONTHS_LONG[p.m] : MONTHS[p.m]) + (year ? " " + p.y : "");
  if (time) s += (comma ? ", " : " ") + p.hh + ":" + p.mm + (o.seconds ? ":" + p.ss : "") + " IST";
  return s;
}

/**
 * `elapsed` returns "2 days ago" as one phrase; the strip sets the quantity in
 * mono and leaves "ago" in the sentence, so the word is split back off rather
 * than rendered inside the figure.
 */
const ago = (ms: number): string => elapsed(ms).replace(/\sago$/, "");

/** The clause, from the word that matters: "…report to Razorpay PA regarding…". */
function clauseShort(q: string): string {
  const i = q.indexOf("report");
  return "…" + (i >= 0 ? q.slice(i) : q);
}

/* ----------------------------------------------------------------- ruler */

/**
 * A 72-hour ruler. The window is a measured thing, not a badge: the fill is
 * elapsed time, the ticks are 24h and 48h, and the marker is now.
 */
function Ruler({ w, pos }: { w: DisputeWindow; pos: string }) {
  return (
    <div className="ruler" aria-hidden="true">
      <div className="ruler__track"></div>
      <div className="ruler__fill" id="ruler-fill" style={{ width: pos }}></div>
      <div className="ruler__tick ruler__tick--end" style={{ left: 0 }}></div>
      <div className="ruler__tick" style={{ left: "33.333%" }}></div>
      <div className="ruler__tick" style={{ left: "66.667%" }}></div>
      <div className="ruler__tick ruler__tick--end" style={{ left: "100%" }}></div>
      <span className="ruler__lab ruler__lab--start" style={{ left: 0 }}>settled {ist(w.settledAt, { year: false, comma: false })}</span>
      <span className="ruler__lab" style={{ left: "33.333%" }}>24h</span>
      <span className="ruler__lab" style={{ left: "66.667%" }}>48h</span>
      <span className="ruler__lab ruler__lab--end" style={{ left: "100%" }}>closes {ist(w.deadlineAt, { year: false, comma: false })}</span>
      <div className="ruler__now" id="ruler-now" style={{ left: pos }}></div>
    </div>
  );
}

/* ------------------------------------------------------------------ strip */

export type WindowStripProps = {
  window: DisputeWindow;
  onPrepareReport: () => void;
  /**
   * The expired state states what she could have disputed and when the next
   * cycle lands. Both live outside `DisputeWindow` — the gap on the
   * explanation, the date on the forecast — so they are passed in. Without
   * them the expired body falls back to the part of the sentence that does not
   * need them.
   */
  unexplainedGap?: number;
  nextSettlementAt?: number;
  /** Defaults to the reference's behaviour: scroll to the forecast. */
  onWatchNext?: () => void;
};

export function WindowStrip({
  window: w,
  onPrepareReport,
  unexplainedGap,
  nextSettlementAt,
  onWatchNext,
}: WindowStripProps) {
  const now = useServerClock(w.serverNow);
  const msRemaining = w.deadlineAt - now;
  const status = msRemaining <= 0 ? "expired" : msRemaining <= w.closingThresholdMs ? "closing" : "open";

  const span = w.deadlineAt - w.settledAt;
  const progress = span > 0 ? Math.min(1, Math.max(0, (now - w.settledAt) / span)) : 0;
  const pos = (progress * 100).toFixed(3) + "%";

  const live = (
    <span className="live">serverNow <span id="cd-clock">{ist(now, { year: false, seconds: true, comma: false })}</span></span>
  );

  const watchNext =
    onWatchNext ??
    (() => {
      const f = document.getElementById("forecast");
      f?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

  if (status === "expired") {
    return (
      <section className="wrap window" id="window" aria-label="Discrepancy reporting window">
        <Eyebrow num="02" label="Reporting window" right="lapsed" />
        <div className="strip strip--expired">
          <div>
            <div className="strip__time">The window closed <span className="n" id="cd-time">{ago(msRemaining)}</span> ago</div>
            <div className="strip__meta"><span>closed <span className="n">{istTimestamp(w.deadlineAt)}</span></span>{live}</div>
          </div>
          <div className="strip__body">
            {unexplainedGap != null ? (
              <>You could have disputed <span className="n">{money(unexplainedGap)}</span> until <span className="n">{ist(w.deadlineAt, { year: false, comma: true })}</span>. </>
            ) : null}
            {nextSettlementAt != null ? (
              <>The report is still here, and the next cycle settles on <span className="n">{ist(nextSettlementAt, { time: false, year: false, long: true })}</span>.</>
            ) : (
              <>The report is still here.</>
            )}
          </div>
          <div className="strip__cta">
            <button className="btn btn--ghost" data-action="watch-next" onClick={watchNext}>Watch the next cycle</button>
            <button className="btn btn--text btn--sm" data-action="open-report" onClick={onPrepareReport}>Open the report</button>
          </div>
          <Ruler w={w} pos={pos} />
        </div>
      </section>
    );
  }

  return (
    <section className="wrap window" id="window" aria-label="Discrepancy reporting window">
      <Eyebrow num="02" label="Reporting window" right="three days from credit" />
      <div className={"strip strip--" + status}>
        <div>
          <div className="strip__time"><span className="n" id="cd-time">{remaining(msRemaining)}</span>left to report this</div>
          <div className="strip__meta"><span>window closes <span className="n">{istTimestamp(w.deadlineAt)}</span></span>{live}</div>
        </div>
        <div className="strip__clause">
          {w.clause.quote ? <q>{clauseShort(w.clause.quote)}</q> : null}
          <div className="strip__cite"><span aria-hidden="true">—</span><Chip citation={w.clause} /></div>
        </div>
        <div className="strip__cta">
          <button className="btn" data-action="open-report" onClick={onPrepareReport}>Prepare discrepancy report</button>
        </div>
        <Ruler w={w} pos={pos} />
      </div>
    </section>
  );
}
