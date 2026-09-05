"use client";

import { useEffect, useRef, useState } from "react";
import type { DiscrepancyReport } from "@assay/contract";
import { Icon } from "@/components/atoms";
import { elapsed, money, remaining } from "@/lib/format";
import { useServerClock } from "@/lib/use-server-clock";

/**
 * The report sheet. Ported from `renderSheet()` in the design reference
 * (lines 1647-1675), with `reportMarkdown()` at line 1676 and the copy /
 * download handlers at lines 1874-1875.
 *
 * This is the artifact the investigation produced, and it is the end of what
 * Assay does. The body is assembled from the reconciled lines — no model wrote
 * a word of it — and it leaves here only by the merchant's own hand: her
 * clipboard, or a file on her disk. Assay never sends it.
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input,select,textarea';

const DOWNLOAD_NAME = "assay-discrepancy-august-2026.md";

export type ReportSheetProps = {
  report: DiscrepancyReport | null;
  onClose: () => void;
};

export function ReportSheet({ report, onClose }: ReportSheetProps) {
  if (!report) return null;
  return <SheetBody report={report} onClose={onClose} />;
}

function SheetBody({ report, onClose }: { report: DiscrepancyReport; onClose: () => void }) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef(0);

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    document.body.classList.add("no-scroll");

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setOpen(true));
    });

    const node = nodeRef.current;
    const first =
      node?.querySelector<HTMLElement>(".x") ?? node?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
    const focusTimer = window.setTimeout(() => first?.focus({ preventScroll: true }), 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const n = nodeRef.current;
      if (!n) return;
      const f = Array.from(n.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (x) => x.offsetParent !== null,
      );
      if (!f.length) return;
      const head = f[0];
      const tail = f[f.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      } else if (!n.contains(document.activeElement)) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      window.clearTimeout(noteTimer.current);
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      document.body.classList.remove("no-scroll");
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, []);

  /* The badge runs off the server's instant, never the browser's. */
  const now = useServerClock(report.window.serverNow);
  const msRemaining = report.window.deadlineAt - now;
  const expired = msRemaining <= 0;

  const say = (msg: string) => {
    setNote(msg);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 2600);
  };

  /* Copy takes the body verbatim: what she pastes is what the engine wrote. */
  const onCopy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(report.body);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = report.body;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
    }
    say(
      ok
        ? "Report copied. Paste it into your own email."
        : "Copy did not work here. Select the text and copy it by hand.",
    );
  };

  const onDownload = () => {
    const markdown =
      "# " +
      report.subject +
      "\n\n" +
      report.body +
      "\n\n---\n" +
      report.claims.length +
      " claims · " +
      money(report.disputedTotal) +
      " · every line traced to its citation\n" +
      "Assay never sends this for you. It is read-only and never moves money.\n";
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = DOWNLOAD_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("Downloaded " + DOWNLOAD_NAME);
  };

  return (
    <>
      <div className={"scrim" + (open ? " is-open" : "")} onClick={() => closeRef.current()} />
      <div
        className={"sheet" + (open ? " is-open" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        ref={nodeRef}
      >
        <header className="sheet__head">
          <div className="sheet__k">assay output · read-only</div>
          <h2 id="sheet-title">Discrepancy report</h2>
          <div className="sheet__stat">
            <div>
              <span className="v">{report.claims.length}</span>
              <span className="t">claims</span>
            </div>
            <div>
              <span className="v">{money(report.disputedTotal)}</span>
              <span className="t">disputed</span>
            </div>
            <div>
              <span className="v">{expired ? elapsed(msRemaining) : remaining(msRemaining)}</span>
              <span className="t">{expired ? "since it closed" : "left to report"}</span>
            </div>
          </div>
          <button className="x" onClick={() => closeRef.current()} aria-label="Close">
            {Icon.close}
          </button>
        </header>

        <div className="sheet__body">
          <div className="sheet__lab">Subject</div>
          <div className="sheet__subject">{report.subject}</div>
          <div className="sheet__gen">
            <span className="sheet__lab" style={{ margin: 0 }}>
              Body
            </span>
            <span>generated from the reconciled lines — nothing here is written by a model</span>
          </div>
          <pre className="report" tabIndex={0}>
            {report.body}
          </pre>
        </div>

        <div className="sheet__foot">
          <span className="sheet__claims">
            {report.claims.length} claims · {money(report.disputedTotal)} · every line traced to its
            citation
          </span>
          <div className="sheet__actions">
            <button className="btn btn--ghost" onClick={onDownload}>
              {Icon.download}Download .md
            </button>
            <button className="btn" onClick={onCopy}>
              {Icon.copy}Copy report
            </button>
          </div>
        </div>

        <p className="sheet__note">
          Assay never sends this for you. It is read-only and never moves money — you paste this
          into your own email.
        </p>
      </div>

      <div className={"toast" + (note ? " is-on" : "")} role="status" aria-live="polite">
        {note ? (
          <>
            {Icon.check}
            <span>{note}</span>
          </>
        ) : null}
      </div>
    </>
  );
}
