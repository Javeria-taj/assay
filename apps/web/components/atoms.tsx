import type { Citation } from "@assay/contract";
import type { ReactNode } from "react";

/**
 * The small shared pieces every zone uses. Ported from the design reference,
 * which builds them as template-literal helpers; here they are components, but
 * the class names and the DOM shape are unchanged so `assay.css` applies
 * without modification.
 */

/* ------------------------------------------------------------------ icons */

const svg = (path: ReactNode, box = "0 0 16 16") => (
  <svg viewBox={box} aria-hidden="true">
    {path}
  </svg>
);

const stroke = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
  arrow: svg(<path d="M3 8h9.5M8.5 4.5L12.5 8l-4 3.5" {...stroke} strokeWidth="1.5" />),
  close: svg(<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />),
  warn: svg(
    <>
      <path d="M6 1.6L11 10.4H1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6 4.8v2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="6" cy="9" r=".75" fill="currentColor" />
    </>,
    "0 0 12 12",
  ),
  check: svg(<path d="M2.5 7.5l3 3 6-6.5" {...stroke} strokeWidth="1.6" />, "0 0 14 14"),
  merge: svg(<path d="M2.5 2v4.5a3 3 0 003 3h6M9 6.5l3 3-3 3" {...stroke} strokeWidth="1.4" />, "0 0 14 14"),
  copy: svg(
    <>
      <rect x="4.5" y="4.5" width="7.5" height="7.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.5 4.5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v5.5a1 1 0 001 1h1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </>,
    "0 0 14 14",
  ),
  download: svg(<path d="M7 2v7M4 6.5L7 9.5l3-3M2.5 11.5h9" {...stroke} strokeWidth="1.4" />, "0 0 14 14"),
  chev: svg(<path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" />, "0 0 10 10"),
  down: svg(<path d="M6 1v9M2.8 7L6 10.2 9.2 7" {...stroke} strokeWidth="1.3" />, "0 0 12 12"),
};

/* -------------------------------------------------------------- citations */

/**
 * Four kinds of provenance, learnt by looking. The chip is the whole point of
 * the waterfall: a line without one is a bug, and the colour says how strong
 * the claim behind the number is.
 */
const KIND: Record<Citation["kind"], { cls: string; name: string; desc: string }> = {
  api_field: { cls: "chip--api", name: "API field", desc: "read directly from the rail" },
  policy_line: { cls: "chip--policy", name: "policy line", desc: "parsed by model, approved by a human" },
  statute: { cls: "chip--statute", name: "statute", desc: "published source" },
  derived: { cls: "chip--derived", name: "derived", desc: "deterministic arithmetic" },
};

export function Chip({ citation, extra }: { citation: Citation; extra?: string }) {
  const k = KIND[citation.kind];
  return (
    <span
      className={"chip " + k.cls + (extra ? " " + extra : "")}
      data-kind={citation.kind}
      title={k.name + " — " + k.desc}
    >
      {citation.label}
    </span>
  );
}

/* ------------------------------------------------------------------ chrome */

export function Eyebrow({ num, label, right }: { num: string; label: string; right?: ReactNode }) {
  return (
    <div className="eyebrow">
      <i>{num}</i>
      <span>{label}</span>
      {right ? <span className="r">{right}</span> : null}
    </div>
  );
}

/**
 * Splits a figure into per-character spans so the digits can settle in
 * sequence. `offsetMs` staggers one figure against another, so the three
 * verdict numbers arrive in the order the eye should read them: what landed,
 * then what was expected, then the difference.
 */
export function Digits({ value, offsetMs = 0 }: { value: string; offsetMs?: number }) {
  return (
    <>
      {value.split("").map((ch, i) => (
        <span
          key={i}
          className="d"
          style={{ "--i": i, "--o": offsetMs + "ms" } as React.CSSProperties}
        >
          {ch}
        </span>
      ))}
    </>
  );
}
