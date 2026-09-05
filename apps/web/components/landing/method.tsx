import { CITATIONS } from "@assay/contract";
import { KIND, L, M, RAILS } from "./facts";
import { money, signed } from "@/lib/format";

/**
 * 09 · provenance, 10 · the engine, 11 · the zero-MDR case.
 *
 * The reference's engine chapter described a model that parses a rate card as
 * work happening now. It does not: there is no parse endpoint and no model in
 * the dependency tree. What is true is stronger and is what the copy says
 * here — the policy was parsed by a model and approved by a person before any
 * of this computed, and that approval is a precondition the engine sweeps for
 * rather than a label it prints.
 *
 * The two quotes are the fixture's own citation records, so the words on the
 * page and the words the API serves cannot drift apart.
 */

const Tick = () => (
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

export function Provenance() {
  return (
    <section className="chap" id="method" aria-labelledby="prov-h">
      <div className="wrap ch">
        <div className="ch__m">
          <span className="mark">09</span>
          <span className="mark__t">Provenance</span>
        </div>
        <div className="ch__b">
          <h2 className="h2" id="prov-h">
            Every number has a provenance.
          </h2>
          <div className="legend" id="legend" aria-label="The four kinds of evidence">
            {(["api_field", "policy_line", "statute", "derived"] as const).map((kind) => (
              <div key={kind}>
                <span className={"chip " + KIND[kind].chip} data-kind={kind}>
                  {KIND[kind].name}
                </span>
                <span>{KIND[kind].gloss}</span>
              </div>
            ))}
          </div>
          <div className="prov" id="prov">
            <div className="exhibit" aria-label="Three representative lines and what each cites">
              {[L.gross, L.fee, L.net].map((l) => (
                <div className="exhibit__row" key={l.id} data-kind={l.citation.kind}>
                  <span className="el">{l.label}</span>
                  <span className="amt">
                    {l.kind === "net_credited" ? money(l.runningBalance) : signed(l.amount)}
                  </span>
                  <span className={"chip " + KIND[l.citation.kind].chip} data-kind={l.citation.kind}>
                    {l.citation.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="quotes" aria-label="Exhibits">
              <div className="quote">
                <div className="quote__h">
                  <span className="chip chip--policy" data-kind="policy_line">
                    {CITATIONS.planFee.label}
                  </span>
                  <span>{CITATIONS.planFee.title}</span>
                </div>
                <blockquote>{CITATIONS.planFee.quote}</blockquote>
                <div className="quote__f">
                  <Tick />
                  parsed by model · approved before computation
                </div>
              </div>
              <div className="quote">
                <div className="quote__h">
                  <span className="chip chip--statute" data-kind="statute">
                    {CITATIONS.zeroMdrStatute.label}
                  </span>
                  <span>Payment and Settlement Systems Act</span>
                </div>
                <blockquote>{CITATIONS.zeroMdrStatute.quote}</blockquote>
              </div>
            </div>
          </div>
          <p className="prov__note">
            The figures on this page are the committed Meera fixture — the one the engine’s tests
            reproduce to the paisa and the API serves unchanged. The rules and the statutes are
            real; the merchant, her volumes and her instrument mix were constructed. No gateway
            was called to make this page.
          </p>
        </div>
      </div>
    </section>
  );
}

export function Engine() {
  return (
    <section className="chap" id="engine" aria-labelledby="eng-h">
      <div className="wrap ch">
        <div className="ch__m">
          <span className="mark">10</span>
          <span className="mark__t">The engine</span>
        </div>
        <div className="ch__b">
          <h2 className="h2" id="eng-h">
            The model reads English. Deterministic code touches the money.
          </h2>
          <div className="eng">
            <div className="eng__row">
              <div>
                <div className="eng__k">first</div>
                <h3 className="eng__h">
                  Model <i>reads the rate card.</i>
                </h3>
              </div>
              <p className="eng__p">
                A model parsed the rate card into machine-checkable policy lines — a quote, a rate
                and a basis for each. It never computes a rupee, and it parses nothing while you
                are looking: what runs is the committed policy, not a model in the request path.
              </p>
            </div>
            <div className="eng__row">
              <div>
                <div className="eng__k">then</div>
                <h3 className="eng__h">
                  Human <i>approves the fee policy.</i>
                </h3>
              </div>
              <p className="eng__p">
                A person approves every policy line before it is used to compute anything, and the
                approval travels with the citation. The engine sweeps for it up front and refuses
                to serve at all if one line is unsigned — checking lazily would let the earlier
                lines compute real money before the refusal arrived.
              </p>
            </div>
            <div className="eng__row eng__row--money">
              <div>
                <div className="eng__k">only then</div>
                <h3 className="eng__h">
                  Deterministic engine <i>touches money.</i>
                </h3>
              </div>
              <div>
                <p className="eng__p">
                  Every rupee of arithmetic is deterministic code, covered by tests that reproduce
                  this settlement to the paisa. If the waterfall does not sum to the credit, the
                  engine refuses to answer rather than return a number that does not add up.
                </p>
                <p className="eng__p">
                  Where the settlement supplies a figure, the engine reads it instead of holding a
                  rate: the on-demand fee comes off the settlement’s own{" "}
                  <span className="n">fees</span> and <span className="n">tax</span> fields, and
                  the policy line for it has nowhere to put a rate.
                </p>
              </div>
            </div>
          </div>
          <div className="eng__law">
            <h3 className="h3">
              AI interprets. Humans approve. <i>Deterministic code computes.</i>
            </h3>
            <p>
              Assay is read-only. Every endpoint is a GET. It never moves money, never writes to
              the gateway, and never sends anything on your behalf.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ZeroMdr() {
  const tied = RAILS.filter((r) => r.collapsed);
  const rest = RAILS.filter((r) => !r.collapsed);
  return (
    <section className="chap" id="zero-mdr" aria-labelledby="zero-h">
      <div className="wrap ch">
        <div className="ch__m">
          <span className="mark">11</span>
          <span className="mark__t">Case: the zero-MDR rail</span>
        </div>
        <div className="ch__b">
          <h2 className="h2" id="zero-h">
            <span className="n">{M.zeroGross}</span> moved on a rail that carries no network MDR.
          </h2>
          <div className="chain" aria-label="From volume to annual fee">
            <div className="cstep">
              <div className="cstep__v">{M.zeroGross}</div>
              <div className="cstep__t">moved through UPI from a bank account in August</div>
            </div>
            <div className="cstep cstep--mid">
              <div className="cstep__v">0 bps network MDR</div>
              <div className="cstep__t">by statute, on the prescribed electronic modes</div>
            </div>
            <div className="cstep cstep--mid">
              <div className="cstep__v">{M.rate} flat plan</div>
              <div className="cstep__t">applied uniformly to every instrument</div>
            </div>
            <div className="cstep cstep--out">
              <div className="cstep__v">{M.zeroFee} / month</div>
              <div className="cstep__t">fee levied on that slice, every cycle</div>
              <div className="cstep__y n">{M.zeroAnnual} a year</div>
            </div>
          </div>
          <div className="zero__foot">
            <div>
              <p className="p">
                UPI from a bank account carries zero network MDR by statute. Under a flat 2% plan
                that slice still attracted <span className="n">{M.zeroFee}</span> of fee. Legal,
                disclosed in your plan, and on no report you are given.
              </p>
              <p className="p">
                Assay does not argue with the plan. It shows which rails the fee sat on.
              </p>
              <div className="zero__cites" style={{ marginTop: "20px" }}>
                <span className="chip chip--statute">{CITATIONS.zeroMdrStatute.label}</span>
                <span className="chip chip--statute">{CITATIONS.s269su.label}</span>
              </div>
            </div>
            <div className="rails" aria-label="Five rails, and how they are reported">
              <div className="rails__k">the five rails behind that fee</div>
              <div className="rails__head">
                <span>Rail</span>
                <span>Gross</span>
                <span>MDR</span>
                <span>Fee</span>
              </div>
              <div className="railgroup railgroup--tied">
                {tied.map((r) => (
                  <div className="rail" key={r.name}>
                    <span className="name">{r.name}</span>
                    <span className="n" data-k="gross">
                      {r.gross}
                    </span>
                    <span className="n" data-k="mdr">
                      {r.mdr}
                    </span>
                    <span className="n fee" data-k="fee">
                      {r.fee}
                    </span>
                  </div>
                ))}
                <div className="bridge">
                  <span>These three arrive on your report as one line: UPI</span>
                  <span className="n">
                    {M.upiGross} · {M.upiFee} fee
                  </span>
                </div>
              </div>
              {rest.map((r) => (
                <div className="rail" key={r.name}>
                  <span className="name">{r.name}</span>
                  <span className="n" data-k="gross">
                    {r.gross}
                  </span>
                  <span className="n" data-k="mdr">
                    {r.mdr}
                  </span>
                  <span className="n fee" data-k="fee">
                    {r.fee}
                  </span>
                </div>
              ))}
              <div className="rails__tot">
                <span>five rails</span>
                <span>
                  <span className="n">{M.railsGross}</span> · fee{" "}
                  <span className="n">{M.railsFee}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
