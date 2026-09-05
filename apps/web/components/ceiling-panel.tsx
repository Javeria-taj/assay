import type { Ceiling } from "@assay/contract";
import { Chip, Eyebrow } from "@/components/atoms";
import { money, percent } from "@/lib/format";

/**
 * The explainability ceiling — the right-hand column, and the argument.
 *
 * Two axes, two forms, never merged. The amount is a closed horizontal line
 * that runs to 100%: every rupee lands on a line. The evidence is a vertical
 * column with a ceiling drawn over it, and the space above the ceiling is the
 * part of the same delta that no field she is given can split.
 *
 * Both bars describe the identical ₹ figure. Merging them into one would
 * collapse "does it reconcile" into "can she check it", which is the whole
 * distinction the panel exists to hold open.
 */

/**
 * The reference writes a whole share as `100%`, not `100.0%` — a settled axis
 * should not carry a decimal that implies it might not be settled. Everything
 * short of whole goes through the shared formatter unchanged.
 */
const pct = (share: number): string => (share === 1 ? "100%" : percent(share));

export function CeilingPanel({ ceiling: c }: { ceiling: Ceiling }) {
  /* Shares, not money: these drive CSS heights and widths. */
  const ok = c.basisVerifiable.share * 100;
  const un = c.basisUnverifiable.share * 100;

  /* Integer paise, summed and never divided. The claim the row makes is that
     the three requests do not overlap, so their total is checkable on screen. */
  const sumFields = c.missingFields.reduce((a, f) => a + f.wouldResolve, 0);

  const z = c.zeroMdrExposure;

  return (
    <aside className="ceiling" id="ceiling" aria-label="What you can actually check">
      <Eyebrow num="04" label="Explainability ceiling" />
      <h2>What you can actually check</h2>
      <p className="ceiling__lede">Two different questions. The first is arithmetic. The second is evidence.</p>

      {/* --------------------------------------------- axis one: the amount */}

      <div className="axis1">
        <div className="axis1__lab">
          <span className="t">Amount reconciles</span>
          <span className="n">
            {money(c.amountReconciled.amount, { paise: false })} · {pct(c.amountReconciled.share)}
          </span>
        </div>
        <div
          className="axis1__bar"
          role="img"
          aria-label={"Amount reconciles, " + pct(c.amountReconciled.share)}
        >
          <i style={{ width: c.amountReconciled.share * 100 + "%" }} />
        </div>
        <div className="axis1__foot">
          <span>every rupee lands on a line</span>
          <span>amountUnreconciled {money(c.amountUnreconciled.amount)}</span>
        </div>
      </div>

      {/* ------------------------------------------- axis two: the evidence */}

      <div className="axis1__lab" style={{ margin: "26px 0 0" }}>
        <span className="t">Basis verifiable</span>
        <span className="n">
          {money(c.basisVerifiable.amount, { paise: false })} · {pct(c.basisVerifiable.share)}
        </span>
      </div>
      <div
        className="ceil"
        role="img"
        aria-label={
          "Basis verifiable " +
          pct(c.basisVerifiable.share) +
          ". Above the ceiling, " +
          money(c.basisUnverifiable.amount, { paise: false }) +
          ", " +
          pct(c.basisUnverifiable.share) +
          ", is unverifiable."
        }
      >
        <div className="ceil__col">
          <div className="ceil__void" style={{ height: un + "%" }} />
          <div className="ceil__fill" style={{ height: ok + "%" }} />
        </div>
        <div className="ceil__notes">
          <div className="ceil__note ceil__note--top">
            <div className="k">beyond the fields you are given</div>
            <div className="v">
              {money(c.basisUnverifiable.amount, { paise: false })} · {pct(c.basisUnverifiable.share)} unverifiable
            </div>
            <div className="d">Charged, disclosed, and reconciled. No field you receive splits it.</div>
          </div>
          <div className="ceil__note ceil__note--bottom">
            <div className="k">evidence you were given</div>
            <div className="v">
              {money(c.basisVerifiable.amount, { paise: false })} · {pct(c.basisVerifiable.share)}
            </div>
            <div className="d">Every rupee here cites a rail field, an approved policy line or a statute.</div>
          </div>
        </div>
        <div className="ceil__boundary" style={{ bottom: ok + "%" }} aria-hidden="true">
          <span>ceiling of what you can check</span>
        </div>
      </div>
      <div className="ceil__legend">
        <span>
          <i className="ok" aria-hidden="true" />
          checkable
        </span>
        <span>
          <i className="un" aria-hidden="true" />
          no field exists
        </span>
      </div>

      <p className="ceiling__headline">{c.headline}</p>

      {/* ------------------------------------------------ the three requests */}

      <div className="ev__h">
        <h3>Three fields would close it</h3>
        <span className="n">evidence requests</span>
      </div>
      <p className="ev__lede">
        They do not overlap, and they sum to the whole {money(c.basisUnverifiable.amount, { paise: false })}.
      </p>
      <div className="ev">
        {c.missingFields.map((f, i) => (
          <div className="ev__item" key={f.id}>
            <span className="ev__i">E-0{i + 1}</span>
            <span className="ev__name">{f.name}</span>
            <span className="ev__amt">
              {money(f.wouldResolve, { paise: false })}
              <small>would resolve</small>
            </span>
            <p className="ev__why">{f.whyItMatters}</p>
            <div className="ev__cite">
              <Chip citation={f.citation} />
              <span className="src">{f.citation.sourceId}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="ev__sum">
        <span>{c.missingFields.length} fields · no overlap</span>
        <span className="n">= {money(sumFields, { paise: false })}</span>
      </div>

      {/* --------------------------------------------------- zero-MDR rails */}
      {/* The fee levied on a rail the law says carries no network MDR.
          Legal, disclosed in the plan, and on no report she is given. */}

      <section className="zero" aria-label="Zero-MDR exposure">
        <div className="zero__k">
          <span>zero-MDR exposure</span>
          <b>
            {money(z.feeLeviedOnZeroMdrRails, { paise: false })} a month · {money(z.annualisedFee, { paise: false })} a
            year
          </b>
        </div>
        <div className="hchain">
          <div className="hstep">
            <div className="hstep__v">{money(z.grossOnZeroMdrRails, { paise: false })}</div>
            <div className="hstep__t">moved on UPI from a bank account</div>
          </div>
          <div className="hstep hstep--mid">
            <div className="hstep__v">0 bps network MDR</div>
            <div className="hstep__t">by statute, on the prescribed electronic modes</div>
          </div>
          <div className="hstep hstep--out">
            <div className="hstep__v">{money(z.feeLeviedOnZeroMdrRails, { paise: false })}</div>
            <div className="hstep__t">fee levied on that slice</div>
          </div>
        </div>
        <div className="zero__foot">
          <p className="zero__body">{z.note}</p>
          <div className="zero__cites">
            {z.citations.map((ci) => (
              <Chip key={ci.sourceId} citation={ci} />
            ))}
          </div>
        </div>
      </section>
    </aside>
  );
}
