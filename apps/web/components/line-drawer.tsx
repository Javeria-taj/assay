"use client";

import { useEffect, useRef, useState } from "react";
import type { Citation, CitationKind, ExplanationLine, InstrumentSlice } from "@assay/contract";
import { Chip, Icon } from "@/components/atoms";
import { istTimestamp, money, signed } from "@/lib/format";

/**
 * The line drawer. Ported from `renderDrawer(l)` in the design reference
 * (lines 1599-1646) and the `.drawer` / `.scrim` markup at line 830.
 *
 * Four sections, in this order and no other: what the line is, how the number
 * was computed, what it is cited to, and — on the one line where the basis
 * cannot be checked — why. The last section is the product. The fee is correct
 * and it reconciles; what the merchant cannot do is check its composition,
 * because three rails carrying different statutory MDR arrive on her report
 * under one word. Those three rows are banded together for exactly that reason.
 */

/* ------------------------------------------------------------------ copy */

/**
 * The prose half of the reference's `KIND` map (line 1142). `atoms.tsx` owns
 * the chip class for each kind but keeps its table module-private, so the
 * sentence under a non-policy citation is restated here verbatim.
 */
const KIND_COPY: Record<CitationKind, { name: string; desc: string }> = {
  api_field: { name: "API field", desc: "read directly from the rail" },
  policy_line: { name: "policy line", desc: "parsed by model, approved by a human" },
  statute: { name: "statute", desc: "published source" },
  derived: { name: "derived", desc: "deterministic arithmetic" },
};

const WORD = ["", "one", "two", "three", "four", "five"];

/* ------------------------------------------------------------- the rails */

type RailGroup = { key: string; collapsed: boolean; items: InstrumentSlice[] };

/** Five rails, three of which reach her as one word. Reference `railsTable()`. */
function RailsTable({ mix }: { mix: InstrumentSlice[] }) {
  const groups: RailGroup[] = [];
  for (const s of mix) {
    const last = groups[groups.length - 1];
    if (s.collapsedInReport && last && last.key === s.reportedAs && last.collapsed) last.items.push(s);
    else groups.push({ key: s.reportedAs, collapsed: s.collapsedInReport, items: [s] });
  }

  const mdr = (s: InstrumentSlice) => (s.instrument === "netbanking" ? "flat" : s.networkMdrBps + " bps");

  const railRow = (s: InstrumentSlice) => (
    <div className="rail" key={s.instrument}>
      <span className="rail__name">{s.displayLabel}</span>
      <span className="n" data-k="gross">
        {money(s.grossCaptured, { paise: false })}
      </span>
      <span className="n" data-k="mdr">
        {mdr(s)}
      </span>
      <span className="n fee" data-k="fee">
        {money(s.feeCharged, { paise: false })}
      </span>
      <span className="rail__rep">{s.reportedAs}</span>
    </div>
  );

  /* Integer paise in, integer paise out. Summed, never scaled. */
  const totGross = mix.reduce((a, s) => a + s.grossCaptured, 0);
  const totFee = mix.reduce((a, s) => a + s.feeCharged, 0);

  /* The statutes the mix itself cites, deduplicated, in the order they appear. */
  const statutes: Citation[] = [];
  for (const s of mix) {
    if (s.citation.kind === "statute" && !statutes.some((c) => c.sourceId === s.citation.sourceId)) {
      statutes.push(s.citation);
    }
  }

  return (
    <>
      <div className="rails">
        <div className="rails__head">
          <span>Rail</span>
          <span>Gross</span>
          <span>MDR</span>
          <span>Fee</span>
          <span>Reported as</span>
        </div>
        {groups.map((g, i) => {
          const tied = g.collapsed && g.items.length > 1;
          if (!tied) {
            return (
              <div className="railgroup" key={g.key + i}>
                {g.items.map(railRow)}
              </div>
            );
          }
          const gross = g.items.reduce((a, s) => a + s.grossCaptured, 0);
          const fee = g.items.reduce((a, s) => a + s.feeCharged, 0);
          return (
            <div className="railgroup railgroup--tied" key={g.key + i}>
              {g.items.map(railRow)}
              <div className="bridge">
                <div className="bridge__t">
                  {Icon.merge}
                  <span>
                    These {WORD[g.items.length] || g.items.length} arrive on your report as one line: {g.key}
                  </span>
                </div>
                <div className="bridge__n">
                  {money(gross, { paise: false })} gross · {money(fee, { paise: false })} fee
                </div>
              </div>
            </div>
          );
        })}
        <div className="rails__tot">
          <span>{WORD[mix.length] || mix.length} rails</span>
          <span>
            <span className="n">{money(totGross, { paise: false })}</span> · fee{" "}
            <span className="n">{money(totFee, { paise: false })}</span>
          </span>
        </div>
      </div>
      <p className="cite__kind" style={{ marginTop: 14 }}>
        UPI from a bank account carries zero network MDR by statute.{" "}
        {statutes.map((c) => (
          <Chip key={c.sourceId} citation={c} />
        ))}
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- overlay */

const FOCUSABLE =
  'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"]),input,select,textarea';

export type LineDrawerProps = {
  line: ExplanationLine | null;
  instrumentMix: InstrumentSlice[];
  onClose: () => void;
};

export function LineDrawer({ line, instrumentMix, onClose }: LineDrawerProps) {
  if (!line) return null;
  return <DrawerBody line={line} instrumentMix={instrumentMix} onClose={onClose} />;
}

function DrawerBody({
  line,
  instrumentMix,
  onClose,
}: {
  line: ExplanationLine;
  instrumentMix: InstrumentSlice[];
  onClose: () => void;
}) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  /* Held in a ref so an inline `onClose` from the parent cannot re-run the
   * mount effect and steal focus back to the close button on every render. */
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    document.body.classList.add("no-scroll");

    /* Two frames: the first lets the drawer paint off-canvas, the second flips
     * the class so the transform actually transitions rather than jumping. */
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
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      document.body.classList.remove("no-scroll");
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, []);

  const l = line;
  const c = l.citation;
  const k = KIND_COPY[c.kind];
  const isTotal = l.kind === "net_credited";
  const amt = isTotal ? money(l.runningBalance) : signed(l.amount);
  const host = c.url ? c.url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;

  return (
    <>
      <div className={"scrim" + (open ? " is-open" : "")} onClick={() => closeRef.current()} />
      <aside
        className={"drawer" + (open ? " is-open" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        ref={nodeRef}
      >
        {/* Keyed on the line so switching rows replays the section lift and
            starts the scroll at the top, as the reference's innerHTML swap does. */}
        <div className="drawer__scroll" key={l.id}>
          <header className="drawer__head">
            <div className="drawer__id">
              {l.id} · {l.kind}
            </div>
            <h2 className="drawer__title" id="drawer-title">
              {l.label}
            </h2>
            <div className="drawer__amt">{amt}</div>
            <div className="drawer__flags">
              {l.amountReconciled ? (
                <span className="tag">
                  {Icon.check}amount reconciles
                </span>
              ) : null}
              {l.basisVerifiable === false ? (
                <span className="tag tag--warn">
                  {Icon.warn}basis not verifiable
                </span>
              ) : null}
              {l.onMerchantReport === false ? (
                <span className="chip chip--flag">not on your report</span>
              ) : null}
            </div>
            <button className="x" onClick={() => closeRef.current()} aria-label="Close">
              {Icon.close}
            </button>
          </header>

          <section className="dsec">
            <div className="dsec__h">
              <h3>How this was computed</h3>
              <span className="tag">{l.basis.computedBy}</span>
            </div>
            <pre className="formula">{l.basis.formula}</pre>
            <dl className="inputs">
              {l.basis.inputs.map((i) => (
                <div key={i.label}>
                  <dt>{i.label}</dt>
                  <dd>{i.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="dsec">
            <div className="dsec__h">
              <h3>Cited to</h3>
            </div>
            <div className="cite__row">
              <Chip citation={c} />
              <span className="cite__src">{c.sourceId}</span>
            </div>
            <div className="cite__title">{c.title}</div>
            {c.quote ? <blockquote className="cite__quote">{c.quote}</blockquote> : null}
            {host && c.url ? (
              <div className="cite__url">
                <a href={c.url} target="_blank" rel="noopener noreferrer">
                  {host}
                </a>
              </div>
            ) : null}
            {c.kind === "policy_line" && c.approvedBy ? (
              <>
                <div className="cite__prov">
                  {Icon.check}
                  <span>
                    parsed by model · approved by {c.approvedBy}
                    {c.approvedAt ? ", " + istTimestamp(c.approvedAt) : ""}
                  </span>
                </div>
                <p className="cite__human">
                  A human approves every policy line before it is used to compute a rupee.
                </p>
              </>
            ) : (
              <p className="cite__kind">
                {k.name} — {k.desc}.
              </p>
            )}
          </section>

          {l.basisVerifiable === false ? (
            <section className="dsec dsec--warn">
              <div className="dsec__h">
                <h3>{Icon.warn}Why you cannot check this</h3>
              </div>
              <p className="why">{l.unverifiableReason}</p>
              <RailsTable mix={instrumentMix} />
            </section>
          ) : null}
        </div>
      </aside>
    </>
  );
}
