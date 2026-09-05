"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KIND, LINES } from "./facts";
import { mountDirector, type DirectorHandle } from "./director";
import { createScene, type SceneHandle } from "./scene";
import { money, signed } from "@/lib/format";

/**
 * Everything on the landing page that only a browser can do.
 *
 * It renders the four fixed layers — the loader, the WebGL canvas, the callout
 * plane, and the drawer with its scrim — and then, once mounted, boots the
 * scene and hands the already-rendered markup to the director.
 *
 * Three degradations are load-bearing and all three survive the port:
 *   · `three` is imported dynamically, so it never runs on the server and a
 *     failed fetch costs the object, not the page;
 *   · `createScene` returns null when WebGL cannot be had, and the director
 *     then draws the cross-section as a flat SVG elevation instead;
 *   · `prefers-reduced-motion` removes the damping in the scene and the
 *     transitions in the stylesheet.
 * `?nogl` forces the fallback path, which is how it gets tested.
 */

const ICON_OK = (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path
      d="M2.5 7.5l3 3 6-6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function LandingRuntime() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [done, setDone] = useState(false);
  /** Which line the drawer is showing. `is-open` is a class, not state — see below. */
  const [line, setLine] = useState<number | null>(null);

  /* ------------------------------------------------------------- the boot */
  useEffect(() => {
    const root = document.getElementById("landing");
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    let cancelled = false;
    let scene: SceneHandle | null = null;
    let director: DirectorHandle | null = null;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const t0 = performance.now();

    (async () => {
      try {
        if (location.search.includes("nogl")) throw new Error("fallback requested");
        const THREE = await import("three");
        if (cancelled) return;
        scene = createScene(THREE, canvas);
      } catch {
        scene = null;
      }
      if (cancelled) return;
      director = mountDirector(root, scene);
      const wait = Math.max(0, 420 - (performance.now() - t0));
      settle = setTimeout(() => {
        setDone(true);
        director?.refresh();
      }, wait);
    })();

    /* never leave the loader up if the network is slow: the page is HTML first */
    const failsafe = setTimeout(() => setDone(true), 2600);

    /* the hero rises once the fonts are in, so nothing reflows mid-animation */
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(() => requestAnimationFrame(() => root.classList.add("is-ready")));

    return () => {
      cancelled = true;
      clearTimeout(failsafe);
      if (settle) clearTimeout(settle);
      director?.destroy();
      scene?.dispose();
    };
  }, []);

  /* ----------------------------------------------------------- the drawer */

  const close = useCallback(() => {
    drawerRef.current?.classList.remove("is-open");
    scrimRef.current?.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    document
      .querySelectorAll<HTMLElement>("#landing .wf__row")
      .forEach((r) => r.classList.remove("is-open"));
    returnRef.current?.focus({ preventScroll: true });
    returnRef.current = null;
    /* unmount only once it has slid out — and not at all if a row is opened
       again first, or the reopened panel would vanish mid-transition */
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setLine(null), 380);
  }, []);

  /* the product rows open a drawer with the formula, the inputs and the rule */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const row = target.closest<HTMLElement>("#landing .wf__row[data-line]");
      if (row) {
        const i = Number(row.dataset.line);
        if (!Number.isFinite(i) || !LINES[i]) return;
        if (closeTimer.current) clearTimeout(closeTimer.current);
        returnRef.current = row;
        document
          .querySelectorAll<HTMLElement>("#landing .wf__row")
          .forEach((r) => r.classList.toggle("is-open", r === row));
        document.body.classList.add("no-scroll");
        setLine(i);
        return;
      }
      if (target.closest("[data-close]") || target.closest(".scrim")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && drawerRef.current && !drawerRef.current.hidden) {
        const f = [...drawerRef.current.querySelectorAll<HTMLElement>("button, a[href]")];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);

  /**
   * The panel is mounted first and slid in after, or the transform has no
   * starting value to animate from. Reading `offsetWidth` commits that starting
   * style, exactly as the reference does — the class is set on the node rather
   * than through state so a throttled frame callback cannot leave the drawer
   * mounted but never opened.
   */
  useEffect(() => {
    if (line === null) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    void drawer.offsetWidth;
    drawer.classList.add("is-open");
    scrimRef.current?.classList.add("is-open");
    const id = setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 40);
    return () => clearTimeout(id);
  }, [line]);

  const l = line === null ? null : LINES[line];
  const k = l ? KIND[l.citation.kind] : null;

  return (
    <>
      <div className={"loader" + (done ? " is-done" : "")} id="loader" aria-hidden="true">
        <span>
          <i />
          <b>Assay</b>/ initialising settlement model
        </span>
      </div>

      <canvas className="gl" id="gl" ref={canvasRef} aria-hidden="true" />
      <div className="labels" id="labels" aria-hidden="true" />

      <div className="scrim" id="scrim" ref={scrimRef} hidden={line === null} />
      <aside
        className="drawer"
        id="drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        hidden={line === null}
      >
        {l && k && (
          <>
            <header className="drawer__head">
              <div className="drawer__id">
                {l.id} · {l.kind}
              </div>
              <h2 className="drawer__title" id="drawer-title">
                {l.label}
              </h2>
              <div className="drawer__amt">
                {l.kind === "net_credited" ? money(l.runningBalance) : signed(l.amount)}
              </div>
              <div className="drawer__flags">
                <span className="tag">
                  {ICON_OK}amount reconciles
                </span>
                {!l.basisVerifiable && <span className="tag tag--warn">basis not verifiable</span>}
                {!l.onMerchantReport && <span className="chip chip--flag">not on your report</span>}
              </div>
              <button className="x" data-close aria-label="Close" ref={closeRef}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <section className="dsec">
              <div className="dsec__h">
                <span>How this was computed</span>
                <span className="tag">deterministic</span>
              </div>
              <pre className="formula">{l.basis.formula}</pre>
              <dl className="inputs">
                {l.basis.inputs.map((input) => (
                  <div key={input.label}>
                    <dt>{input.label}</dt>
                    <dd>{input.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="dsec">
              <div className="dsec__h">
                <span>Cited to</span>
              </div>
              <div>
                <span className={"chip " + k.chip}>{l.citation.label}</span>{" "}
                <span
                  className="n"
                  style={{ fontSize: "11.5px", color: "var(--ink-3)", marginLeft: "8px" }}
                >
                  {l.citation.sourceId}
                </span>
              </div>
              <div className="cite__title">{l.citation.title}</div>
              {l.citation.quote && <blockquote className="cite__quote">{l.citation.quote}</blockquote>}
              {l.citation.kind === "policy_line" ? (
                <>
                  <div className="cite__prov">
                    {ICON_OK}
                    <span>parsed by model · approved before computation</span>
                  </div>
                  <p className="cite__human">
                    A human approved this line before it was used to compute a rupee
                    {l.citation.approvedBy ? " — " + l.citation.approvedBy : ""}.
                  </p>
                </>
              ) : (
                <p className="cite__human">
                  {k.name} — {k.gloss}.
                </p>
              )}
            </section>

            {!l.basisVerifiable && l.unverifiableReason && (
              <section className="dsec dsec--warn">
                <div className="dsec__h">
                  <span>Why you cannot check this</span>
                </div>
                <p>{l.unverifiableReason}</p>
              </section>
            )}
          </>
        )}
      </aside>
    </>
  );
}
