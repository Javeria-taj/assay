# Assay

**Assay tells you what your settlement is actually made of.**

---

Meera runs a D2C skincare business. In August she captured **₹12,00,000** on a
flat 2% plan. She refunded **₹32,000**. So she expected **₹11,44,000** to land.

**₹11,28,918** landed.

She cannot explain **₹15,082** — about **₹1.81 lakh a year**. Here is the whole
of it, which is what Assay puts on one screen, each line citing the rule that
produced it:

| Line | Amount | Cited to | On her report? |
|---|---:|---|---|
| Gross captured | ₹12,00,000.00 | API · `payment.amount` | yes |
| Gateway fee at 2% | − ₹24,000.00 | policy `P-01` | yes, as a lump |
| Refunds issued (principal) | − ₹32,000.00 | API · `refund.amount` | yes |
| GST at 18% on the fee | − ₹4,320.00 | policy `P-02` | yes |
| Failed-payment charges, 1,100 × ₹3 | − ₹3,300.00 | policy `P-03` | **no** |
| Chargebacks, 2 × ₹2,700 principal | − ₹5,400.00 | API · `dispute.amount` | yes |
| Chargeback fees, 2 × ₹500 | − ₹1,000.00 | policy `P-04` | **no** |
| On-demand settlement fee | − ₹1,062.00 | **API · `fees` + `tax`** | **no** |
| **Actually credited** | **₹11,28,918.00** | derived | yes |

Three of the five lines that make up her ₹15,082 are not itemised anywhere she
can see. That is why she finds out at month-end.

**Her contractual right to dispute expired on day four.**

> "In case of discrepancies, You shall report to Razorpay PA regarding such
> discrepancy **within three (3) days** upon the receipt of the fund
> settlements."
> — Razorpay Terms & Conditions, Part B

Every cycle, for essentially every small merchant in India, a right they hold
lapses unused.

---

## The finding: reconciling and verifying are not the same question

The interesting number is not the ₹15,082. It is what happens when you ask a
harder question of the full ₹71,082 gross-to-net delta.

**Every rupee reconciles. 33.8% of it cannot be checked.**

|  | share | amount |
|---|---:|---:|
| Amount reconciles against the rail's own figures | **100%** | ₹71,082.00 |
| Basis is verifiable from fields the merchant is given | **66.2%** | ₹47,082.00 |
| Basis is **not** verifiable from the report she is given | **33.8%** | ₹24,000.00 |

The unverifiable third is the gateway fee itself. It is exactly right, and Meera
has no way to know that, because it spans five rails carrying different
statutory network MDR — and three of them arrive on her report labelled
identically as **"UPI"**.

**Three fields would close the gap.** They do not overlap, and they sum to the
whole of it:

| Missing field | Would resolve | Why |
|---|---:|---|
| Instrument sub-type | ₹18,000.00 | Bank-account UPI carries 0% network MDR by statute, RuPay-credit-on-UPI ~2%, and PPI-on-UPI 1.1% above ₹2,000. The rail knows which is which — `payment.upi.payer_account_type` carries exactly those three values. The settlement recon report does not: it carries `method`, which reads `UPI` for all three. Recovering the distinction means joining all 960 settled rows back to their payments, one call each. |
| Card BIN tier | ₹4,800.00 | debit, credit, commercial and international BINs carry materially different interchange |
| Per-line fee basis | ₹1,200.00 | each line states an amount but not the base it was computed on |

And one consequence worth stating plainly, because it is invisible rather than
improper: **₹7,20,000 of Meera's August volume moved on a rail that carries zero
network MDR by statute** — UPI from a bank account, under PSSA §10A and
Income-tax Act §269SU. Under a flat 2% plan that slice still attracted
**₹14,400** of fee. Legal, disclosed in her plan, and absent from every report
she is given.

The framing throughout is *"here are the three fields that would close the
gap"* — never *"someone is hiding fees."*

---

## Where the AI is, and where it deliberately is not

**The model reads and writes English. Deterministic code touches the money.**

The fee policy is model-parsed and human-approved **before** it computes a
rupee. Every line of it — `P-01` through `P-06` — carries `parsedBy: "model"`,
`approved: true`, a named approver, a timestamp, and the verbatim quote it was
parsed from. `GET /v1/policy` serves the whole thing, unapproved lines included,
so a fee line in the waterfall can be followed to its rule and the rule to its
own source.

Approval is a precondition, not a label. `applyPolicy` sweeps every line before
any arithmetic begins and throws on the first one without a human's name on it;
the route layer maps that to a 409 `policy_not_approved` and serves no payload
at all. The sweep is up front on purpose — checking lazily would let `P-01`
through `P-05` compute real money before the refusal arrived. That sweep is the
guard on the path that actually serves: `calculate` takes the contract's
`Policy`, and every rupee it computes has passed the check.

A second, stronger gate exists and is **not** on that path, which is worth
saying rather than glossing. `ApprovedFeePolicy` in
`apps/api/src/domain/policy.ts` has no constructor but narrowing through
`isApproved`, so a function demanding one cannot be handed a policy nobody
signed — a refusal the compiler makes rather than the runtime. The engine was
settled in favour of the contract's own types, so nothing on the request path
demands it today. The type-level proof is real and it typechecks; it is
currently the road not taken.

Every rupee of arithmetic and every pass/fail in this repo is deterministic
code, covered by tests that reproduce the table above to the paisa.

And one rule underneath that one: **rupees come from what the rail returned, not
from a rate we typed in.** The on-demand settlement fee above has no rate
anywhere in this repo. Policy line `P-05` holds
`readFromApi: "settlement.fees + settlement.tax"` and `rateBps: null`; the
domain's `read_from_api` variant has no rate field to put one into; and
`onDemandFee` stops rather than computes if that line ever grows a rate or names
a different pair of fields. A stale rate on camera costs exactly as much
credibility as a wrong API call.

**Where the model is not: it parses nothing at request time.** There is no live
parse endpoint and no Anthropic SDK in the dependency tree. What computes is the
committed, human-approved policy — the documented fallback, chosen rather than
arrived at.

---

## Prior art

| | What it does |
|---|---|
| **Terra Insight — TransactIG** | India, small; post-hoc enterprise fee audit |
| **Primer** | Payment orchestration with reporting |
| **Leapfin** | Revenue data / accounting automation |
| **Tally, Zoho Books** | The recon layer Indian SMBs actually use today |
| **ReconPe, Recko, Osfin** | Marketplace and payment-rail reconciliation for Indian sellers |

**None predict. None explain to a citation. None are built around the three-day
window.**

---

## Documented vs constructed

Both statements ship, and every policy line carries its own `provenance`, so the
distinction travels in the payload rather than in a footnote.

**Documented** — traceable to a published source: the three-day discrepancy
clause; zero network MDR on UPI-from-bank-account and RuPay debit (PSSA §10A,
Income-tax Act §269SU); GST at 18% on gateway fees; the instrument sub-type
distinctions; that the on-demand settlement response carries `fees` and `tax`
fields.

**Constructed** — Meera, her ₹12L monthly volume, her instrument mix, her flat
2% plan, the ₹3 failed-payment charge and the ₹500 chargeback fee. Chosen to
show scale at a believable Indian SMB.

**The arithmetic is correct. The merchant is not real.** Assay is
gateway-agnostic and runs on synthetic data; it is never pointed at a named
provider's real statement.

---

## Run it

```bash
pnpm install
pnpm test        # 15 contract + 97 engine — reproduces the table above, to the paisa
pnpm dev         # the API on :4318 and the web app on :3000, together
```

Nothing needs configuring. The API defaults to the synthetic source, and
`ASSAY_SOURCE=live` without keys is a startup failure rather than a quiet
fallback — a demo that serves constructed data under a live banner is the one
failure this project cannot afford.

```bash
pnpm mock                                # the committed fixture, zero deps → :4317
pnpm verify:mock                         # nine endpoints + four invariants, vs the mock
BASE=http://localhost:4318 pnpm verify   # the same fourteen checks, vs the running API
```

```bash
curl -s localhost:4318/v1/settlements/stl_2608mera01/explanation
```

## Layout

```
packages/contract/     the Zod contract both sides import, the typed client, and
                       the Meera fixture — frozen at v0.1.0, one source of truth
apps/api/src/domain/   the seam: RawCycle, the instrument table, the policy types,
                       attribution, and the constructed Meera cycle
apps/api/src/engine/   the arithmetic: calculate, ceiling, forecast, report, window.
                       Pure — no clock, no env, no randomness, no I/O
apps/api/src/sources/  where a cycle comes from: the seeded synthetic generator,
                       and the read-only live rail adapter
apps/api/src/routes/   the nine contract endpoints, and nothing else
apps/web/              Next.js app — an API-reachability page so far
tools/mock-server.mjs  zero-dependency mock API, runs on a clean clone
tools/invariants/      the invariant checks, run over the wire against any deploy
tools/verify-contract  conformance checker; points at the mock or the real API
```

- **`API_CONTRACT.md`** — conventions, endpoints, and the ten invariants the API
  must hold.
- **`docs/BUILD_LOG.md`** — what broke, what surprised us, and what we did.
- **`FRONTEND.md`** — how to build the whole UI against the mock.

## What a reviewer should look at first

Four files carry the argument. Everything else is plumbing around them.

| File | Why |
|---|---|
| `apps/api/src/engine/ceiling.ts` | The finding in executable form. The two axes are computed independently and never collapsed, `missingFields` is a **partition** of the instrument mix rather than three hardcoded numbers that happen to add up, and no rupee figure appears anywhere in the file. |
| `apps/api/src/engine/policy-apply.ts` | The aggregation decision every figure in the waterfall rests on — per-slice for the fee, cycle-aggregate for the GST, integer multiplication for per-event charges — with the reasoning for each. Also the approval sweep and the `P-05` guard that refuses a rate. |
| `apps/api/src/engine/calculate.ts` | `basisVerifiable` is **derived** from the gaps the source declared, in one place, never assigned. If a rail starts answering, the ceiling moves on its own and nobody edits a percentage. |
| `apps/api/src/domain/attribution.ts` | Two small functions, and the two wrong answers they exist to prevent: keying attribution on the citation instead of `reportedAs` silently drops ₹14,400, and filtering zero-MDR rails numerically returns ₹15,600 against a fixture that says ₹14,400. |

## Status

Every counter below was run, not estimated.

| | |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm test` | 15 contract + 97 engine |
| `pnpm test:golden` | 6/6 |
| `pnpm verify:mock` | 14/14 |
| `BASE=… pnpm verify` | **14/14 against the real API** — nine endpoints, plus four invariant checks made over the wire |

Inside those: the calculator's own gate reads **TIER-1 34/34**, the ceiling's
reads **CEILING 32/32**, and the cross-cycle check runs against five generated
settlements rather than the one the fixture ships, so a passing invariant is a
property of the engine and not of one payload.

`calculate(MEERA_CYCLE, COMMITTED_POLICY)` deep-equals the frozen explanation
fixture, `analyseCeiling` of that result deep-equals the frozen ceiling, and the
served `/explanation`, `/ceiling` and `/policy` deep-equal the same fixtures over
HTTP. The contract, the fixture, the mock and the conformance checker are done;
so are the calculator, the ceiling analyser, the seeded synthetic generator, the
dispute window, the discrepancy report, the forecast, and all nine endpoints of
the real API — GET-only, and refusing to boot if the contract names an endpoint
it does not mount.

**What is not done:**

- **Nothing is deployed.** `render.yaml` is committed and both services build,
  but the Blueprint was never created. There is no URL and nothing is live.
  Everything above runs locally.
- **The live policy parser was not built.** No parse endpoint, no Anthropic SDK
  in the dependency tree. The committed human-approved policy is what computes.
- **The Razorpay spike made zero real API calls** — there were never any test
  keys. The endpoint paths and field lists in `docs/razorpay-shapes.json` were
  confirmed against the published documentation and are marked
  `observed: false`. The live driver compiles and reaches the API; it has never
  seen a real settlement. Every rupee figure in this README came from
  constructed data, served through the synthetic source.
- **The web app is a health check.** `apps/web` proves the browser can reach the
  API cross-origin and that the response satisfies the shared contract. The
  screens in `FRONTEND.md` are not built.

Clone it and you get a green suite, a real API on `localhost:4318` serving the
whole worked example over HTTP, a mock that runs before `pnpm install` has
finished, and a checker that tells you in about a second whether either of them
is lying.

## Licence

MIT.
