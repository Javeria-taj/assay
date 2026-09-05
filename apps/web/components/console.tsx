"use client";

import { useCallback, useMemo, useState } from "react";
import type { DisputeWindow, ExplanationLine } from "@assay/contract";
import type { ConsoleData } from "@/lib/api";
import { SkipLink } from "./skip-link";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { Verdict } from "./verdict";
import { WindowStrip } from "./window-strip";
import { Waterfall } from "./waterfall";
import { CeilingPanel } from "./ceiling-panel";
import { ForecastStrip } from "./forecast-strip";
import { LineDrawer } from "./line-drawer";
import { ReportSheet } from "./report-sheet";
import { DemoSwitcher, type DemoWindowState } from "./demo-switcher";
import { useReveal } from "@/lib/use-reveal";

/**
 * The console, assembled.
 *
 * The zones are pure renderers of one settlement; this component owns the only
 * things a person can change — which line the drawer is showing, whether the
 * report sheet is open, and which window state is on display. Everything else
 * came from the server and does not move.
 */
export function Console({ data }: { data: ConsoleData }) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [demo, setDemo] = useState<DemoWindowState>("live");

  /* Plays the entrance cascade on load, and again whenever the demo switcher
   * changes scene — the same points the reference replays it. */
  useReveal(demo);

  const openLine: ExplanationLine | null =
    data.explanation.lines.find((l) => l.id === openLineId) ?? null;

  const closeDrawer = useCallback(() => setOpenLineId(null), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  /**
   * The demo switcher moves the clock, never the data.
   *
   * A recording cannot wait three real days for the window to lapse, and the
   * expired state is the beat that shows what the product is for. So an
   * override shifts `serverNow` to an instant inside the state being shown and
   * lets the strip derive everything else exactly as it would live — rather
   * than hand-setting a status and a countdown that could then disagree.
   *
   * "live" is the default, so the screen tells the truth unless somebody
   * deliberately says otherwise.
   */
  const shownWindow: DisputeWindow = useMemo(() => {
    if (demo === "live") return data.window;

    const { settledAt, deadlineAt, closingThresholdMs } = data.window;
    const serverNow =
      demo === "open"
        ? deadlineAt - closingThresholdMs - 42 * 60 * 60 * 1000
        : demo === "closing"
          ? deadlineAt - 17 * 60 * 60 * 1000 - 42 * 60 * 1000
          : deadlineAt + 2 * 24 * 60 * 60 * 1000;

    const msRemaining = deadlineAt - serverNow;
    const status: DisputeWindow["status"] =
      msRemaining <= 0 ? "expired" : msRemaining <= closingThresholdMs ? "closing" : "open";

    return { ...data.window, settledAt, serverNow, msRemaining, status };
  }, [demo, data.window]);

  return (
    <>
      <SkipLink />

      <SiteHeader
        settlementId={data.explanation.settlementId}
        cycleLabel={data.explanation.cycleLabel}
        merchant={data.explanation.merchant}
        settledAt={data.explanation.settledAt}
      />

      <main id="main" className="page">
        <Verdict explanation={data.explanation} />

        <WindowStrip window={shownWindow} onPrepareReport={() => setSheetOpen(true)} />

        <div className="wrap cols">
          <Waterfall
            explanation={data.explanation}
            zeroMdr={data.ceiling.zeroMdrExposure}
            onOpenLine={setOpenLineId}
          />
          <CeilingPanel ceiling={data.ceiling} />
        </div>

        <ForecastStrip forecast={data.forecast} />
      </main>

      <SiteFooter policy={data.policy} reconciliation={data.explanation.reconciliation} />

      <LineDrawer
        line={openLine}
        instrumentMix={data.explanation.instrumentMix}
        onClose={closeDrawer}
      />

      <ReportSheet report={sheetOpen ? data.report : null} onClose={closeSheet} />

      <DemoSwitcher value={demo} onChange={setDemo} />
    </>
  );
}
