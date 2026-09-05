"use client";

import { useCallback, useState } from "react";
import type { ExplanationLine } from "@assay/contract";
import type { ConsoleData } from "@/lib/api";
import { Verdict } from "./verdict";
import { WindowStrip } from "./window-strip";
import { Waterfall } from "./waterfall";
import { CeilingPanel } from "./ceiling-panel";
import { ForecastStrip } from "./forecast-strip";
import { LineDrawer } from "./line-drawer";
import { ReportSheet } from "./report-sheet";

/**
 * The console, assembled.
 *
 * The zones are pure renderers of one settlement; this component owns the only
 * two pieces of state on the screen — which line the drawer is showing, and
 * whether the report sheet is open — because they are the only things a person
 * can change. Everything else came from the server and does not move.
 */
export function Console({ data }: { data: ConsoleData }) {
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openLine: ExplanationLine | null =
    data.explanation.lines.find((l) => l.id === openLineId) ?? null;

  const closeDrawer = useCallback(() => setOpenLineId(null), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

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
              {data.explanation.settlementId}
            </span>
            <div className="menu">
              <span className="menu__btn" aria-label="Settlement cycle">
                <span>{data.explanation.cycleLabel}</span>
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

      <main id="main" className="page">
        <Verdict explanation={data.explanation} />

        <WindowStrip window={data.window} onPrepareReport={() => setSheetOpen(true)} />

        <div className="wrap cols">
          <Waterfall explanation={data.explanation} onOpenLine={setOpenLineId} />
          <CeilingPanel ceiling={data.ceiling} />
        </div>

        <ForecastStrip forecast={data.forecast} />
      </main>

      <LineDrawer
        line={openLine}
        instrumentMix={data.explanation.instrumentMix}
        onClose={closeDrawer}
      />

      <ReportSheet report={sheetOpen ? data.report : null} onClose={closeSheet} />
    </>
  );
}
