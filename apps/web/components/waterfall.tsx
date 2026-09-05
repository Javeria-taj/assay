"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Ceiling, Citation, Explanation, ExplanationLine } from "@assay/contract";
import { Chip, Icon, Eyebrow } from "@/components/atoms";
import { count, money, signed } from "@/lib/format";

/**
 * The trace. Nine lines on one running axis.
 *
 * This is the product: the settlement taken apart into the lines that made it,
 * every line carrying the citation it was derived from, and the running balance
 * carried down the middle so the eye can follow the money. The axis is ink
 * while the balance is still what she counted and amber once it is not.
 *
 * Ported from `renderWaterfall()` in the design reference (lines 1284-1340).
 * Class names, DOM shape, animation delays and copy are the reference's; only
 * the data source changed — it reads the API's `Explanation` instead of the
 * mockup's inline fixture.
 */

/* ------------------------------------------------------------------- hints
   The basis, said in the shortest form that is still checkable. Most lines
   carry their own formula; seven of them read better as the count and the unit
   the charge was actually levied on, which is what the reference shows.

   Keyed on `kind` rather than on the line id the reference used: the kind is
   the contract's own enum, the id is an opaque string, and both produce the
   same string for every line the API returns. */
function rowHint(l: ExplanationLine): string {
  switch (l.kind) {
    case "gross_captured":
      return l.count === null ? l.basis.formula : count(l.count) + " captured payments";
    case "refund_principal":
      return l.count === null ? l.basis.formula : count(l.count) + " refunds settled";
    case "failed_payment_fee":
      return l.count === null || l.unitAmount === null
        ? l.basis.formula
        : count(l.count) + " attempts × " + money(l.unitAmount, { paise: false });
    case "chargeback_principal":
    case "chargeback_fee":
      return l.count === null || l.unitAmount === null
        ? l.basis.formula
        : count(l.count) + " disputes × " + money(l.unitAmount, { paise: false });
    case "instant_settlement_fee": {
      // The two halves the rail returns, quoted from the basis the API sent
      // rather than re-derived here: an amount is never rebuilt for display.
      const input = (label: string) => l.basis.inputs.find((i) => i.label === label)?.value;
      const fees = input("settlement.fees");
      const tax = input("settlement.tax");
      return fees && tax ? "settlement.fees " + fees + " + settlement.tax " + tax : l.basis.formula;
    }
    case "net_credited":
      return "signed sum of the eight lines above";
    default:
      return l.basis.formula;
  }
}

/* ---------------------------------------------------------------- provenance
   The four kinds, in the order the footer teaches them. The chips themselves
   come from `<Chip>`; this table exists only for the legend, which prints the
   name of the kind rather than a citation label. */
const LEGEND: Array<{ kind: Citation["kind"]; cls: string; name: string; desc: string }> = [
  { kind: "api_field", cls: "chip--api", name: "API field", desc: "read directly from the rail" },
  { kind: "policy_line", cls: "chip--policy", name: "policy line", desc: "parsed by model, approved by a human" },
  { kind: "statute", cls: "chip--statute", name: "statute", desc: "published source" },
  { kind: "derived", cls: "chip--derived", name: "derived", desc: "deterministic arithmetic" },
];

export function Waterfall({
  explanation,
  zeroMdr,
  onOpenLine,
}: {
  explanation: Explanation;
  /**
   * The zero-MDR exposure belongs to the ceiling's payload but renders at the
   * foot of the trace, under the citation legend — the reference builds it
   * inside `renderWaterfall`, and the wide column is the only place its
   * four-step chain fits without wrapping.
   */
  zeroMdr: Ceiling["zeroMdrExposure"];
  onOpenLine: (lineId: string) => void;
}) {
  /* Hovering a citation quiets every other kind, so provenance reads as a
     system rather than as decoration on one row. */
  const [highlight, setHighlight] = useState<string | null>(null);
  const kindUnder = (target: EventTarget | null) =>
    target instanceof Element ? (target.closest(".chip[data-kind]") as HTMLElement | null)?.dataset.kind ?? null : null;

  const lines = explanation.lines;
  const last = lines.length - 1;

  /* Where she stopped counting: the line whose running balance is still the
     number her own arithmetic produces. Found in the data, never an index. */
  const breakAfter = lines.findIndex(
    (l) => l.kind !== "net_credited" && l.runningBalance === explanation.merchantExpected,
  );

  /* Gross to net, in paise, as the ceiling states it. Integer subtraction of
     two figures the API sent; nothing here divides, and nothing formats by
     hand. */
  const totalDelta = explanation.grossCaptured - explanation.netCredited;

  return (
    <section
      className="wf"
      id="waterfall"
      aria-label="Where the money went"
      data-hl={highlight ?? undefined}
      onMouseOver={(e) => {
        const k = kindUnder(e.target);
        if (k) setHighlight(k);
      }}
      onMouseOut={(e) => {
        const k = kindUnder(e.target);
        if (k) setHighlight(null);
      }}
    >
      <Eyebrow num="03" label="The trace" right={lines.length + " lines · reconciles to the paisa"} />
      <div className="wf__title">
        <h2>
          Where the <span className="n">{money(totalDelta, { paise: false })}</span> went
        </h2>
        <span className="sub">gross → net · delta {money(explanation.reconciliation.delta)}</span>
      </div>
      <div className="wf__head" aria-hidden="true">
        <span>Ref</span>
        <span>Line item · basis</span>
        <span>Amount</span>
        <span></span>
        <span>Running balance</span>
        <span>Cited to</span>
        <span></span>
      </div>
      <ol className="wf__list">
        {lines.map((l, i) => {
          const isTotal = l.kind === "net_credited";
          const below = i > breakAfter;
          const amt = isTotal ? money(l.runningBalance) : signed(l.amount);
          const delay = 340 + i * 52 + (below ? 400 : 0);
          const cls = [
            "row",
            l.basisVerifiable === false && "row--unverifiable",
            below && "row--gap",
            isTotal && "row--total",
            highlight !== null && l.citation.kind === highlight && "is-kin",
          ]
            .filter(Boolean)
            .join(" ");
          const ax = [
            "ax",
            i === 0 && "ax--first",
            i === last && "ax--last",
            below && "ax--gap",
            isTotal && "ax--net",
            i === breakAfter && "ax--threshold",
          ]
            .filter(Boolean)
            .join(" ");
          const aria = [
            l.label,
            amt,
            isTotal ? "" : "running balance " + money(l.runningBalance),
            "cited to " + l.citation.label,
            l.basisVerifiable === false ? "basis not verifiable" : "",
            l.onMerchantReport === false ? "not on your report" : "",
            "Opens the line.",
          ]
            .filter(Boolean)
            .join(", ");

          const row = (
            <li key={l.id}>
              <button
                type="button"
                className={cls}
                data-action="open-line"
                data-line={l.id}
                data-kind={l.citation.kind}
                style={{ "--o": delay + "ms" } as CSSProperties}
                aria-label={aria}
                onClick={() => onOpenLine(l.id)}
              >
                <span className="row__id n" aria-hidden="true">
                  {l.id}
                </span>
                <span className="row__main">
                  <span className="row__label">{l.label}</span>
                  <span className="row__hint">{rowHint(l)}</span>
                  {l.basisVerifiable === false ? (
                    <span className="row__reason">
                      {Icon.warn}
                      <span>{l.unverifiableReason}</span>
                    </span>
                  ) : null}
                  {l.onMerchantReport === false ? (
                    <span className="row__flags">
                      <span className="chip chip--flag">not on your report</span>
                    </span>
                  ) : null}
                </span>
                <span className="row__amt">{amt}</span>
                <span className={ax} aria-hidden="true"></span>
                <span className={"row__bal" + (i === breakAfter ? " row__bal--expected" : "")}>
                  {isTotal ? "" : money(l.runningBalance)}
                </span>
                <span className="row__cite">
                  <Chip citation={l.citation} />
                </span>
                <span className="row__arrow" aria-hidden="true">
                  {Icon.arrow}
                </span>
              </button>
            </li>
          );

          if (i !== breakAfter) return row;

          /* The break shares the row grid, so the mark sits on the axis and the
             expected balance sits under the balance column. */
          const bo = 340 + (breakAfter + 1) * 52 + 40;
          return [
            row,
            <li key="break" className="break" style={{ "--o": bo + "ms" } as CSSProperties}>
              <div className="break__rule" aria-hidden="true">
                <span className="break__mark">
                  <span></span>
                </span>
                <span className="break__eq">
                  <b>{money(explanation.merchantExpected)}</b> expected balance
                </span>
              </div>
              <div className="break__body">
                <p className="break__copy">
                  She stopped counting here. Everything below is the{" "}
                  <span className="n">{money(explanation.unexplainedGap, { paise: false })}</span>.
                </p>
                <span className="break__note">known above · evidence below</span>
              </div>
            </li>,
          ];
        })}
      </ol>
      <div className="wf__foot" aria-label="How to read the citations">
        {LEGEND.map((k) => (
          <span className="key" key={k.kind}>
            <span className={"chip " + k.cls} data-kind={k.kind}>
              {k.name}
            </span>
            <span>{k.desc}</span>
          </span>
        ))}
      </div>

      {/* The fee levied on a rail the law says carries no network MDR. Legal,
          disclosed in the plan, and on no report she is given. */}
      <section className="zero" aria-label="Zero-MDR exposure">
        <div className="zero__k">
          <span>zero-MDR exposure</span>
          <b>
            {money(zeroMdr.feeLeviedOnZeroMdrRails, { paise: false })} a month ·{" "}
            {money(zeroMdr.annualisedFee, { paise: false })} a year
          </b>
        </div>

        <div className="hchain">
          <div className="hstep">
            <div className="hstep__v">{money(zeroMdr.grossOnZeroMdrRails, { paise: false })}</div>
            <div className="hstep__t">moved on UPI from a bank account</div>
          </div>
          <div className="hstep hstep--mid">
            <div className="hstep__v">0 bps network MDR</div>
            <div className="hstep__t">by statute, on the prescribed electronic modes</div>
          </div>
          <div className="hstep hstep--mid">
            <div className="hstep__v">
              {(explanation.merchant.plan.headlineBps / 100).toFixed(2)}% flat plan
            </div>
            <div className="hstep__t">applied uniformly to every instrument</div>
          </div>
          <div className="hstep hstep--out">
            <div className="hstep__v">{money(zeroMdr.feeLeviedOnZeroMdrRails, { paise: false })}</div>
            <div className="hstep__t">fee levied on that slice</div>
          </div>
        </div>

        <div className="zero__foot">
          <p className="zero__body">{zeroMdr.note}</p>
          <div className="zero__cites">
            {zeroMdr.citations.map((c: Citation, i: number) => (
              <Chip key={c.sourceId + i} citation={c} />
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
