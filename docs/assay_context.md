---
document: assay_context
version: 1.0
updated: 2026-09-04
product: Assay
audience: frontend designer and developer, and any AI coding or design tool they use
status: contract frozen at v0.1.0; scope locked; visual design open
stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
api_contract: "@assay/contract (Zod), consumed by both the API and the web app"
currency: INR, integer paise everywhere, no floats
---

# Assay — build context

Everything needed to design and build Assay's interface, in one file. Written so
a person can read it start to finish, and so an AI tool can be handed the whole
thing as context and produce something correct.

---

## 0. How to use this file

**If you are a person:** read sections 1–7, then keep 8 and 9 open while you
work. Section 10 is the list of things that will cost you if you get them wrong.

**If you are an AI tool:** this file is complete and self-contained. Every fact
needed to generate correct UI is stated here explicitly — the data shapes, the
exact copy, the numbers, the rules and the prohibitions. Do not invent product
facts, figures, field names, or copy that is not in this file. Where this file
says a thing is fixed, treat it as fixed. Where it says a thing is open, you may
propose. If a required detail is genuinely absent, say so rather than inventing it.

### Ready-to-paste prompts

**Prompt A — build a screen or component**

> You are building a screen for Assay. The attached `assay_context.md` is the
> complete specification: product, data shapes, exact copy, and rules. Read all
> of it before writing code.
>
> Build: `<name the zone, overlay or component from section 7>`
>
> Constraints: Next.js App Router, TypeScript strict, Tailwind, shadcn/ui.
> Import types and the client from `@assay/contract`; never redeclare them.
> All money is integer paise — render with `formatPaise()`, never divide by 100
> yourself. Do not invent copy: use the strings in section 9 verbatim. Follow
> every rule in section 10. Use the sample payloads in the appendices as your
> fixture data.
>
> Return one file. No placeholder TODOs.

**Prompt B — propose visual directions**

> Read the attached `assay_context.md`. Section 11 lists what is already decided
> and what is open to you. Propose three distinct visual directions for the
> screen in section 7, each with a named point of view, and show the waterfall
> and the ceiling panel in each. Keep every string, number and structural
> decision exactly as specified — vary only the visual language. Explain the
> tradeoff of each direction in two sentences.

**Prompt C — review work against the spec**

> Read the attached `assay_context.md`, then review the code or design I give
> you against it. Report only real violations, ranked. Check especially:
> section 10's rules, the copy in section 9 word for word, the field bindings in
> section 8.4, and whether any money value is handled as a float.

---

## 1. The product in one page

**Assay tells you what your settlement is actually made of.**

An Indian merchant takes payments online. Once a cycle the payment gateway
deposits money into her bank account. The number that lands is never the number
she expected, because a stack of fees, taxes, refunds, chargebacks and charges
came off in between — some itemised on her reports, some not.

Assay takes one settlement and decomposes it: gross captured down to net
credited, line by line, with each line citing the exact rule that produced it.
Then it does the thing nothing else does — it tells her which of those lines she
could have checked for herself, and which she could not, and names the exact
fields that are missing.

And it does this **inside the three days** she has to dispute it.

Assay is **read-only**. It never moves money, never writes to the gateway, and
never sends anything on the merchant's behalf. Every endpoint is a GET.

---

## 2. Who the user is

**Meera.** She runs a direct-to-consumer skincare business in India, doing about
₹12,00,000 a month in online payments. She is not a finance professional. She is
competent with numbers and completely reasonable in her expectations: she is on
a flat 2% plan, so she expects gross minus 2% minus her refunds to land.

She is **constructed** — she is not a real merchant, and every screen says so.
See rule 2 in section 10; this matters more than it looks.

She checks her settlements at month end, when she does her books. By then the
three-day window has closed.

---

## 3. The problem

Razorpay's published Terms & Conditions, Part B:

> "In case of discrepancies, You shall report to Razorpay PA regarding such
> discrepancy **within three (3) days** upon the receipt of the fund
> settlements."

Merchants notice at month-end. Their contractual right to dispute expired on day
four. Every cycle, for essentially every small merchant in India, a right they
hold lapses unused.

**That is the product's reason to exist, and it is the sentence the whole
interface is built around.**

### The worked example

Every screen renders this one settlement. These figures are exact and the test
suite asserts them to the rupee.

| Line | Amount | Cited to | Itemised on her report? |
|---|---:|---|---|
| Gross captured | ₹12,00,000.00 | API · `payment.amount` | yes |
| Gateway fee at 2% | − ₹24,000.00 | policy `P-01` | yes, as one lump |
| Refunds issued (principal) | − ₹32,000.00 | API · `refund.amount` | yes |
| GST at 18% on the fee | − ₹4,320.00 | policy `P-02` | yes |
| Failed-payment charges, 1,100 × ₹3 | − ₹3,300.00 | policy `P-03` | **no** |
| Chargebacks, 2 × ₹2,700 principal | − ₹5,400.00 | API · `dispute.amount` | yes |
| Chargeback fees, 2 × ₹500 | − ₹1,000.00 | policy `P-04` | **no** |
| On-demand settlement fee | − ₹1,062.00 | API · `fees` + `tax` | **no** |
| **Actually credited** | **₹11,28,918.00** | derived | yes |

She expected ₹11,44,000.00 — gross, minus 2%, minus refunds.
**She cannot explain ₹15,082.00**, which is about ₹1.81 lakh a year.

Three of the five lines that make up that gap are not itemised anywhere she can
see. That is the answer to "why didn't she notice?"

### The instrument mix behind it

| Rail | Gross | Statutory network MDR | Fee charged at flat 2% | Reported to her as |
|---|---:|---:|---:|---|
| UPI — bank account | ₹7,20,000 | 0 bps (by statute) | ₹14,400 | "UPI" |
| UPI — RuPay credit | ₹1,20,000 | ~200 bps | ₹2,400 | "UPI" |
| UPI — wallet / PPI | ₹60,000 | 110 bps above ₹2,000 | ₹1,200 | "UPI" |
| Cards | ₹2,40,000 | ~180 bps | ₹4,800 | "Card" |
| Netbanking | ₹60,000 | flat per txn | ₹1,200 | "Netbanking" |

Gross sums to ₹12,00,000. Fees sum to ₹24,000. Both exactly.

---

## 4. The finding — two axes that must never be collapsed

This is the intellectual core of the product. If the interface makes only one
point, make this one.

There are two different questions you can ask of a settlement:

1. **Does it add up?** — `amountReconciled`. For Meera: **100%**. Every rupee of
   the ₹71,082 gross-to-net delta is accounted for.
2. **Can she check it?** — `basisVerifiable`. For Meera: **66.24%**.

The gap between those two numbers is the finding.

| | Share | Amount |
|---|---:|---:|
| Amount reconciles against the rail's own figures | 100% | ₹71,082.00 |
| Basis is verifiable from fields she is given | 66.2% | ₹47,082.00 |
| Basis is **not** verifiable from the report she is given | 33.8% | ₹24,000.00 |

The unverifiable third is the ₹24,000 gateway fee. It is exactly correct, and
she has no way to know that, because it spans five rails carrying different
statutory MDR and three of them arrive on her report labelled identically as
**"UPI"**.

**Three fields would close the gap.** They do not overlap and they sum to the
whole ₹24,000:

| Missing field | Would resolve | Why it matters |
|---|---:|---|
| Instrument sub-type | ₹18,000.00 | Bank-account UPI carries 0% network MDR by statute, RuPay-credit-on-UPI ~2%, and PPI-on-UPI 1.1% above ₹2,000. The rail knows which is which — `payment.upi.payer_account_type` carries exactly those three values. The settlement recon report does not: it carries `method`, which reads `UPI` for all three. Recovering the distinction means joining all 960 settled rows back to their payments, one call each. |
| Card BIN tier | ₹4,800.00 | Debit, credit, commercial and international BINs carry materially different interchange, and the tier is not on her report |
| Per-line fee basis | ₹1,200.00 | Each line states an amount but not the base it was computed on, so an ad-valorem charge and a flat one look identical |

### One consequence, stated carefully

**₹7,20,000 of her August volume moved on a rail carrying zero network MDR by
statute** — UPI from a bank account, under PSSA §10A and Income-tax Act §269SU.
Under a flat 2% plan that slice still attracted **₹14,400** of fee.

This is legal, disclosed in her plan, and invisible on every report she is given.

**Tone rule, and it is not optional:** the framing is always *"here are the three
fields that would close the gap."* It is never *"someone is hiding fees."* The
product measures; it does not accuse. Every string in the interface must pass
that test. An assay reports what a thing is made of — that is why the product is
called what it is called.

---

## 5. Where the AI is, and where it deliberately is not

**The model reads and writes English. Deterministic code touches the money.**

- The model parses a rate card or terms document into a machine-checkable fee
  policy, and normalises differently-shaped reports into one schema.
- A human approves that policy before it is ever used to compute a rupee.
- Every rupee of arithmetic and every pass/fail is deterministic code, covered by
  tests that reproduce section 3's table exactly.

And one rule underneath that one: **rupees come from what the rail returned, not
from a rate we typed in.** The on-demand settlement fee has no rate anywhere in
the codebase. Policy line `P-05` holds `readFromApi: "settlement.fees +
settlement.tax"` and `rateBps: null`. A stale rate on camera costs exactly as
much credibility as a wrong API call.

**This shows up in the UI in three places, and all three are required:**

1. Every citation carries a `kind`. When it is `api_field`, the interface marks
   it as read from the rail — that is the strongest provenance on the screen.
2. The line drawer shows the policy line's approver and timestamp:
   "parsed by model · approved by javeria.taj, 4 Sep 09:45 IST".
3. The report sheet says its body was assembled from reconciled lines, not
   written by a model.

---

## 6. Scope — what you are building

**One route: `/s/[settlementId]`.**

| | What | Priority |
|---|---|---|
| Zone A | Verdict header — landed, expected, the gap — plus the 3-day window strip | P0 |
| Zone B | The waterfall — nine lines, each citing its rule | **P0 — this is the product** |
| Zone C | Ceiling panel — the split bar and the three missing fields | **P0** |
| Overlay 1 | Line drawer — basis, inputs, citation, and the rail split | P0 |
| Overlay 2 | Report sheet — preview, copy, download | P1 |
| Zone D | Forecast strip, below the fold | P2 |

**Deliberately not built:** no landing page, no settlement list, no settings, no
auth, no gateway-connect flow, no policy page. The policy is reachable through
any citation chip. The deployed app is the front door.

**Cut order if time runs out:** forecast strip → report download (keep copy) →
report sheet → mobile pass. **Never cut the waterfall, the drawer, or the
ceiling panel.**

**The one screen that must be excellent:** a merchant sees ₹11,28,918 landed when
she expected ₹11,44,000, and in one view understands every rupee of the ₹15,082,
each line citing the rule that produced it. If that lands, the rest is bonus.

---

## 7. Screen specification

Low-fidelity wireframes for all of this are in `docs/wireframes.html` — open it
in a browser. They fix structure and leave the visual language open.

### 7.1 Zone A — the verdict header

Three figures side by side, in this order:

1. **Landed in your account** — ₹11,28,918.00. The largest thing on the screen.
2. **You expected** — ₹11,44,000.00, secondary weight, with the basis beneath it:
   "gross − 2% − refunds".
3. **You cannot explain** — ₹15,082.00, equal weight to the first, with
   "≈ ₹1.81L a year" beneath.

Also in the header bar: the product name, the settlement id (`stl_2608mera01`), a
cycle selector reading "August 2026", and the constructed-scenario badge.

### 7.2 The window strip

Sits directly under the verdict, full width. Contains: the countdown, the exact
closing timestamp, the clause quote, and the CTA "Prepare discrepancy report".

Three states, driven by `window.status`:

| Status | Condition | Behaviour |
|---|---|---|
| `open` | more than 24h remaining | Neutral. "2d 18h left to report this" |
| `closing` | 24h or less remaining | Elevated. "17h 42m left to report this". **This is the demo state — record the video against it** |
| `expired` | past the deadline | The strongest state on the product. "The window closed 2 days ago" plus: "You could have disputed ₹15,082.00 until 6 Sep, 11:00 IST. The report is still here, and the next cycle settles on 3 October." CTA becomes "Watch the next cycle" |

Build the expired state early. It is the only screen that shows what the product
is *for*, and it is the 3:00–4:00 beat of the pitch video.

### 7.3 Zone B — the waterfall

The main column. Nine rows, in fixed order, from `explanation.lines[]`.

Each row shows: label, a basis hint, the signed amount, the running balance, and
a citation chip. Some rows additionally carry:

- a **"not on your report"** marker when `onMerchantReport === false` (3 rows do)
- a **"no way to check this"** flag when `basisVerifiable === false` (1 row does —
  the gateway fee) which renders `unverifiableReason`

The whole row is the hit target and opens the drawer.

**The break.** After the third row the running balance is ₹11,44,000.00 — exactly
what she expected. Put a visible divider there: *"She stopped counting here.
Everything below is the ₹15,082."* This is not decoration. It splits the table
into "what she knew about" and "the gap", and it is the clearest single moment on
the screen. It came out of the arithmetic, not out of a design idea.

### 7.4 Zone C — the ceiling panel

The side column. Three stacked blocks:

1. **The two bars.** "Amount reconciles" at 100%, full width. "Basis verifiable"
   as a split bar, 66.2% against 33.8%, with both amounts labelled. Then the
   headline sentence: *"Every rupee reconciles. ₹24,000 of it — 33.8% — you have
   no way to check."*
2. **Three fields would close it.** The three rows from section 4, each with its
   name, what it would resolve, and one line on why. Plus the note that they do
   not overlap and sum to the whole ₹24,000.
3. **The zero-MDR callout.** ₹7,20,000 on a zero-MDR rail, ₹14,400 of fee, with
   both statute citations.

The two bars must not be merged into one. "It adds up" and "you can check it" are
different claims and the distance between them is the entire finding.

### 7.5 Zone D — the forecast strip

Below the fold, full width, low prominence. Shows the cycle in progress, the
projected credit (₹3,90,184.00), a one-line explanation that it is the same
engine run forward, and the honesty badge: **"accuracy not yet measured — no
backtest has been run"**. See rule 4 in section 10.

### 7.6 The line drawer — overlay 1

Opens from any waterfall row. Four sections:

1. **Header** — line id and kind (`L-01 · gateway_fee`), the label, the amount.
2. **How this was computed** — the formula in mono, the named inputs with their
   values, and a "deterministic" tag.
3. **Cited to** — the citation chip, its title, the verbatim quote in a quote
   block, the source link where there is one, and for a policy line the approver
   and timestamp.
4. **Why you cannot check this** — only on rows where `basisVerifiable` is false.
   The reason, then the five-rail table with gross, MDR and fee per rail — and
   the three UPI rows visually banded together under the line *"these three
   arrive on your report as one line: UPI"*.

That banded group is the finding made visual. It is the most important thing in
the drawer and probably the most important detail in the product.

### 7.7 The report sheet — overlay 2

Opens from the window strip CTA. A centred sheet containing:

- Title "Discrepancy report" and the countdown badge
- The subject line, in mono
- The report body, in mono, preformatted, scrollable — the full text is in
  section 9
- A footer line: "5 claims · ₹15,082.00 · every line traced to its citation"
- Two actions: "Download .md" (secondary) and "Copy report" (primary)
- A closing note: **"Assay never sends this for you. It is read-only and never
  moves money — you paste this into your own email."**

That last line is a product decision, not an apology. State it plainly.

### 7.8 States

| State | Trigger | Behaviour |
|---|---|---|
| Loading | first paint | A skeleton that holds the exact final layout so nothing jumps. No spinners on the main screen |
| Contract error | `AssayContractError` | The screen refuses to render the waterfall and says so: *"Assay will not show you a number it cannot stand behind."* Show the endpoint, contract version, and the failing field paths. Offer Retry and Copy diagnostics |
| Panel error | one endpoint 500s | Only that panel fails. The waterfall keeps working and still reconciles. Offer "Retry this panel" |
| Empty | no settlement yet | *"Nothing has settled yet."* Point at the forecast, which already has ₹4,10,000 of captured payments to work from |

### 7.9 Mobile — 390

Same content, one column, same order: verdict, window strip, waterfall, ceiling,
forecast. The CTA goes full width. Every hit target 44px minimum. The rail table
in the drawer becomes a stacked list. Build this last.

---
## 8. The data

### 8.1 Conventions — these are absolute

| | |
|---|---|
| **Money** | Integer **paise**, signed. `₹11,28,918.00` is `112891800`. Deductions are negative. There are no floats anywhere and there is no currency field — the API is INR-only. Render with `formatPaise()` from `@assay/contract`. **Never divide by 100 yourself.** |
| **Number format** | Indian digit grouping: `₹11,28,918.00`, not `₹1,128,918.00`. `formatPaise()` already does this |
| **Time** | Epoch **milliseconds**, integer, UTC. Never a string, never a timezone |
| **Envelope** | Success `{ ok: true, data, requestId }`. Failure `{ ok: false, error: { code, message, field }, requestId }` |
| **Paging** | Cursor: `{ items, nextCursor }`. `nextCursor: null` is the last page |
| **Method** | `GET` only. Anything else returns 405 |
| **Clock** | Any countdown is driven by the `serverNow` the server returns, never the browser clock |

Error codes: `not_found` · `bad_request` · `unauthorized` · `policy_not_approved`
· `reconciliation_failed` · `internal`.

`reconciliation_failed` is the important one: if the waterfall does not sum to
the credited amount, the API refuses to answer rather than returning a number
that does not add up.

### 8.2 Endpoints

| Name | Path | Returns |
|---|---|---|
| `health` | `GET /v1/health` | contract version, `source: "mock" \| "live"` |
| `listSettlements` | `GET /v1/settlements` | paged `SettlementSummary` |
| `getSettlement` | `GET /v1/settlements/:settlementId` | `SettlementSummary` |
| `getExplanation` | `GET /v1/settlements/:settlementId/explanation` | **`Explanation`** |
| `getCeiling` | `GET /v1/settlements/:settlementId/ceiling` | `Ceiling` |
| `getWindow` | `GET /v1/settlements/:settlementId/window` | `DisputeWindow` |
| `getReport` | `GET /v1/settlements/:settlementId/report` | `DiscrepancyReport` |
| `getForecast` | `GET /v1/forecast/current` | `Forecast` |
| `getPolicy` | `GET /v1/policy` | `Policy` |

The settlement id in every sample is `stl_2608mera01`.

### 8.3 Types

These are generated from the Zod schemas in `@assay/contract`. **Import them
from the package — do not redeclare them.** They are reproduced here so an AI
tool has the full shape without needing the repo.

```ts
type Paise   = number;  // integer, signed. Deductions negative.
type EpochMs = number;  // integer, UTC milliseconds
type Share   = number;  // 0..1, four decimal places. 0.3376 = 33.76%

type CitationKind = "api_field" | "policy_line" | "statute" | "derived";

interface Citation {
  kind: CitationKind;
  label: string;        // chip text, under 18 chars, e.g. "API · fees + tax"
  sourceId: string;     // policy line id, API field path, or statute ref
  title: string;
  quote: string | null; // verbatim rule text, shown in the drawer
  url: string | null;
  approvedAt: EpochMs | null;  // policy_line only
  approvedBy: string | null;   // policy_line only
}

type LineKind =
  | "gross_captured" | "gateway_fee" | "refund_principal" | "tax_on_fees"
  | "failed_payment_fee" | "chargeback_principal" | "chargeback_fee"
  | "instant_settlement_fee" | "adjustment" | "net_credited";

interface Basis {
  formula: string;
  inputs: { label: string; value: string }[];  // values arrive pre-formatted
  computedBy: "deterministic";
}

interface ExplanationLine {
  id: string;                  // "L-00" .. "L-08"
  kind: LineKind;
  label: string;
  amount: Paise;               // signed. Deductions negative.
  runningBalance: Paise;       // balance AFTER this line
  count: number | null;        // e.g. 1100 failed attempts
  unitAmount: Paise | null;    // e.g. 300 (₹3)
  basis: Basis;
  citation: Citation;
  onMerchantReport: boolean;   // false -> render "not on your report"
  amountReconciled: boolean;   // does the number add up?
  basisVerifiable: boolean;    // can she CHECK it? false -> render the flag
  unverifiableReason: string | null;  // required when basisVerifiable is false
}

type Instrument =
  | "upi_bank_account" | "upi_rupay_credit" | "upi_ppi"
  | "card_debit" | "card_credit" | "netbanking" | "wallet";

interface InstrumentSlice {
  instrument: Instrument;
  displayLabel: string;
  reportedAs: string;          // what HER report calls it — the collapse
  grossCaptured: Paise;
  paymentCount: number;
  networkMdrBps: number;       // 0 for bank-account UPI, by statute
  feeCharged: Paise;
  collapsedInReport: boolean;  // true -> indistinguishable from another slice
  citation: Citation;
}

interface Explanation {
  settlementId: string;
  cycleId: string;
  cycleLabel: string;          // "August 2026"
  periodStart: EpochMs;
  periodEnd: EpochMs;
  settledAt: EpochMs;
  merchant: {
    id: string; name: string; segment: string;
    plan: { label: string; headlineBps: number; citation: Citation };
    constructed: true;         // ALWAYS true. The UI must say so.
  };
  grossCaptured: Paise;
  netCredited: Paise;
  merchantExpected: Paise;     // gross − headline rate − refunds
  expectationBasis: string;    // "gross − 2% − refunds"
  unexplainedGap: Paise;       // merchantExpected − netCredited
  lines: ExplanationLine[];
  instrumentMix: InstrumentSlice[];
  reconciliation: { ok: boolean; computedNet: Paise; statedNet: Paise; delta: Paise };
  policyId: string;
}

interface CeilingBucket { amount: Paise; share: Share }

interface MissingField {
  id: string; name: string; whyItMatters: string;
  wouldResolve: Paise;         // non-overlapping; they sum to basisUnverifiable
  citation: Citation;
}

interface Ceiling {
  settlementId: string;
  totalDelta: Paise;           // grossCaptured − netCredited
  amountReconciled: CeilingBucket;
  amountUnreconciled: CeilingBucket;
  basisVerifiable: CeilingBucket;
  basisUnverifiable: CeilingBucket;
  missingFields: MissingField[];
  headline: string;
  method: string;
  zeroMdrExposure: {
    grossOnZeroMdrRails: Paise;
    feeLeviedOnZeroMdrRails: Paise;
    annualisedFee: Paise;
    note: string;
    citations: Citation[];
  };
}

type WindowStatus = "open" | "closing" | "expired";

interface DisputeWindow {
  settlementId: string;
  settledAt: EpochMs;
  deadlineAt: EpochMs;         // settledAt + 3 days
  serverNow: EpochMs;          // DRIVE THE COUNTDOWN OFF THIS
  msRemaining: number;
  status: WindowStatus;
  closingThresholdMs: number;  // 86_400_000
  clause: Citation;
}

interface DiscrepancyReport {
  settlementId: string;
  generatedAt: EpochMs;
  window: DisputeWindow;
  subject: string;
  body: string;                // markdown; Copy and Download use it verbatim
  claims: { lineId: string; statement: string; amount: Paise; citation: Citation }[];
  disputedTotal: Paise;
}

interface Forecast {
  cycleId: string;
  asOf: EpochMs;
  expectedSettlementAt: EpochMs;
  capturedSoFar: Paise;
  projectedNet: Paise;
  projectedLines: ExplanationLine[];
  backtest: {
    method: "policy_engine_replay";
    cycles: number;            // 0 means NOT MEASURED, not zero error
    medianAbsError: Paise;
    maxAbsError: Paise;
    note: string;
  };
}

interface PolicyLine {
  id: string; label: string; appliesTo: string;
  rateBps: number | null;
  fixedAmount: Paise | null;
  readFromApi: string | null;  // set instead of a rate when the rail supplies it
  quote: string; url: string | null;
  parsedBy: "model";
  approved: boolean;           // must be true before it computes a rupee
  approvedBy: string | null; approvedAt: EpochMs | null;
  provenance: "documented" | "constructed";
}

interface Policy {
  id: string; version: string; label: string;
  sourceDocuments: { title: string; url: string | null }[];
  approvedBy: string; approvedAt: EpochMs;
  lines: PolicyLine[];
}

interface SettlementSummary {
  id: string; cycleId: string; cycleLabel: string;
  settledAt: EpochMs;
  grossCaptured: Paise; netCredited: Paise;
  merchantExpected: Paise; unexplainedGap: Paise;
  windowStatus: WindowStatus;
  basisUnverifiableShare: Share;
}
```

### 8.4 Using the client

```ts
import { createClient, formatPaise } from "@assay/contract";

const api = createClient({ baseUrl: process.env.NEXT_PUBLIC_ASSAY_API! });

const explanation = await api.getExplanation({ settlementId: "stl_2608mera01" });
const ceiling     = await api.getCeiling({ settlementId: "stl_2608mera01" });
const win         = await api.getWindow({ settlementId: "stl_2608mera01" });

formatPaise(explanation.netCredited);              // "₹11,28,918.00"
formatPaise(-2400000);                             // "-₹24,000.00"  <- see rule 3
formatPaise(300, { paise: false });                // "₹3"
```

`next.config.js` must transpile the workspace package:

```js
const nextConfig = { transpilePackages: ["@assay/contract"] };
export default nextConfig;
```

Every response is parsed through the Zod schema before it reaches a component.
A drifting API throws `AssayContractError` at the boundary rather than rendering
a wrong number. **That is deliberate. Do not catch and swallow it.**

### 8.5 Element to field map

| UI element | Endpoint | Field |
|---|---|---|
| "Landed in your account" | explanation | `netCredited` |
| "You expected" | explanation | `merchantExpected`, with `expectationBasis` beneath |
| "You cannot explain" | explanation | `unexplainedGap` |
| Cycle selector | explanation | `cycleLabel` |
| Constructed badge | explanation | `merchant.constructed` (always true) |
| Waterfall rows | explanation | `lines[]` — `label`, `amount`, `runningBalance`, `count`, `unitAmount` |
| Row basis hint | explanation | `lines[].basis.formula` |
| Citation chip | explanation | `lines[].citation.label`; API marker when `.kind === "api_field"` |
| "not on your report" | explanation | `lines[].onMerchantReport === false` |
| "no way to check" flag | explanation | `lines[].basisVerifiable === false` → render `.unverifiableReason` |
| The break divider | explanation | after the row where `runningBalance === merchantExpected` |
| Drawer — formula, inputs | explanation | `lines[].basis.formula`, `.basis.inputs[]` |
| Drawer — quote, approver | explanation | `lines[].citation.quote`, `.approvedBy`, `.approvedAt`, `.url` |
| Drawer — rail table | explanation | `instrumentMix[]`; band the rows where `collapsedInReport === true` |
| Reconciled bar | ceiling | `amountReconciled.share` |
| Split bar | ceiling | `basisVerifiable.share` vs `basisUnverifiable.share` |
| Ceiling headline | ceiling | `headline` |
| Three missing fields | ceiling | `missingFields[]` — `name`, `whyItMatters`, `wouldResolve` |
| Zero-MDR callout | ceiling | `zeroMdrExposure` — all fields, plus `citations[]` |
| Countdown | window | `msRemaining`, `status`, driven off `serverNow` |
| Clause quote | window | `clause.quote`, `clause.label` |
| Report subject and body | report | `subject`, `body` |
| Report footer count | report | `claims.length`, `disputedTotal` |
| Forecast figure | forecast | `projectedNet`, `capturedSoFar` |
| Forecast honesty badge | forecast | `backtest.cycles === 0` |

---

## 9. Copy deck

Use these strings verbatim. Do not paraphrase, do not "improve", do not
generate alternatives unless asked. Anything dynamic comes from the API.

### Header and verdict

- `Assay`
- `stl_2608mera01`
- `August 2026`
- `constructed scenario`
- `Landed in your account`
- `You expected`
- `gross − 2% − refunds`
- `You cannot explain`
- `≈ ₹1.81L a year`

### Window strip

- open: `2d 18h left to report this`
- closing: `17h 42m left to report this`
- expired: `The window closed 2 days ago`
- `window closes 6 Sep 2026, 11:00 IST`
- CTA: `Prepare discrepancy report` — expired variant: `Watch the next cycle`
- clause: `"…report to Razorpay PA regarding such discrepancy within three (3) days upon the receipt of the fund settlements."` attributed `— T&C Part B`
- expired body: `You could have disputed ₹15,082.00 until 6 Sep, 11:00 IST. The report is still here, and the next cycle settles on 3 October.`

### Waterfall

- heading: `Where the ₹71,082 went`
- sub: `9 lines · reconciles to the paisa`
- column headers: `Line` · `Amount` · `Running` · `Cited to`
- the break: `She stopped counting here. Everything below is the ₹15,082.`
  (in-product, addressed to the reader: `This is where you stopped counting. Everything below is the ₹15,082.`)
- footer: `Every row opens a drawer with its formula, inputs and the rule it cites.`
- markers: `not on your report` · `You have no way to check how this splits across rails`

Row labels, in order: `Gross captured` · `Gateway fee at 2%` ·
`Refunds issued (principal)` · `GST at 18% on the fee` ·
`Failed-payment charges` · `Chargebacks (principal)` · `Chargeback fees` ·
`On-demand settlement fee` · `Actually credited`

### Ceiling panel

- heading: `What you can actually check`
- `Amount reconciles` / `Basis verifiable` / `unverifiable`
- headline: `Every rupee reconciles. ₹24,000 of it — 33.8% — you have no way to check.`
- `Three fields would close it`
- sub: `They do not overlap, and they sum to the whole ₹24,000.`
- zero-MDR heading: `₹7,20,000 moved on a zero-MDR rail`
- zero-MDR body: `UPI from a bank account carries zero network MDR by statute. Under a flat 2% plan that slice still attracted ₹14,400 of fee. Legal, disclosed in your plan, and on no report you are given.`
- statute chips: `PSSA §10A` · `IT Act §269SU`

### Line drawer

- `How this was computed` · `deterministic`
- `Cited to`
- `parsed by model · approved by javeria.taj, 4 Sep 09:45 IST`
- `A human approves every policy line before it is used to compute a rupee.`
- `Why you cannot check this`
- `The total is checkable. Its composition is not. This fee is levied across five rails carrying different statutory network MDR, and three of them reach you labelled identically as UPI.`
- rail table headers: `Rail` · `Gross` · `MDR` · `Fee`
- the banded line: `These three arrive on your report as one line: UPI`

### Report sheet

- `Discrepancy report`
- `Subject` · `Body`
- `generated from the reconciled lines · nothing here is written by a model`
- footer: `5 claims · ₹15,082.00 · every line traced to its citation`
- actions: `Download .md` · `Copy report`
- note: `Assay never sends this for you. It is read-only and never moves money — you paste this into your own email.`
- subject line: `Settlement discrepancy — August 2026 cycle (stl_2608mera01)`

The body comes from `report.body` and must be rendered verbatim, preformatted.
It is reproduced in Appendix C.

### Forecast strip

- `September, in progress`
- `projected credit, same engine run forward over payments captured so far`
- `accuracy not yet measured — no backtest has been run`

### States

- loading: no copy, skeleton only
- contract error: `Assay will not show you a number it cannot stand behind` /
  `The settlement came back in a shape this build does not recognise, so the waterfall was not rendered. Showing a partial breakdown here would be worse than showing none.` / actions `Retry` · `Copy diagnostics`
- panel error: `The ceiling analysis did not load` / `The breakdown on the left is unaffected and still reconciles.` / `Retry this panel`
- empty: `Nothing has settled yet` / `Assay explains a settlement after it lands. Your first cycle is still collecting — the forecast already has ₹4,10,000 of captured payments to work from.` / `See what is projected to land`

---

## 10. Rules — non-negotiable

1. **The countdown runs off `window.serverNow`, not the browser clock.** Compute
   the offset between `serverNow` and `Date.now()` at fetch time and tick from
   there. A countdown that disagrees with the server on camera is exactly what a
   payments panel notices.
2. **`merchant.constructed` is always true and the interface says so** — visibly,
   unembarrassed, not tucked into a footer. Being straight about a constructed
   scenario is a credibility gain, not a cost. Never present it as real data.
3. **Never render a bare negative.** Deductions show as `− ₹24,000.00` — a real
   minus sign (U+2212) and a space. Not a hyphen, not brackets. `formatPaise()`
   returns a hyphen form; format deductions for display yourself.
4. **`backtest.cycles === 0` is not zero error.** It means no backtest has been
   run. Render "accuracy not yet measured". A `±₹0` badge would be a lie.
5. **Let `AssayContractError` surface.** The client parses every response at the
   boundary so a drifting API fails loudly instead of rendering wrong money. Do
   not catch and swallow it; render the contract-error state.
6. **Money is integer paise.** Use `formatPaise()`. Never divide by 100, never
   store money in a float, never use `toLocaleString` on a paise value.
7. **Never merge the two ceiling axes.** "It adds up" and "you can check it" are
   different claims. Keep two bars.
8. **The product measures; it does not accuse.** Every string frames a gap as a
   missing field, never as concealment. Reject any copy that implies wrongdoing.
9. **Do not invent figures or copy.** Every number comes from the API. Every
   string comes from section 9. If something is missing, say so.
10. **Assay is read-only.** No control may imply it sends, files, disputes, or
    moves money on the merchant's behalf. Copy and Download are the only actions
    on the report.
11. **Indian digit grouping**, always: `₹11,28,918.00`.
12. **Every waterfall line shows a citation.** A line without one is a bug.

---

## 11. What is decided, and what is yours

### Decided — do not change without a two-person conversation

- The scope in section 6: one route, three zones, two overlays
- The order of the three verdict figures, and the order of the nine waterfall rows
- Every string in section 9
- Every number in sections 3 and 4
- The field bindings in section 8.5
- The break divider after the refunds row
- The banded UPI group in the drawer's rail table
- The two-axis ceiling model
- Read-only, GET-only, never sends
- The stack: Next.js App Router, TypeScript, Tailwind, shadcn/ui

### Yours — nobody has decided these, and nobody should

- The entire visual language: palette, type, weight, density, spacing, radii,
  borders, elevation, motion
- Whether the waterfall is a table, a list, or a stepped visual
- The form of the two bars, and how the unverifiable share is distinguished
- The drawer's presentation and transition
- Iconography
- How the mobile waterfall handles the drawer
- Light, dark, or both

**One note:** earlier versions of this work carried a dark palette with IBM Plex
Sans and Mono. **That is not binding.** It was a starting sketch, not a decision.
Design what the product should look like.

---

## 12. Running it

```bash
pnpm install
pnpm mock          # the API, zero dependencies -> http://localhost:4317
```

`apps/web/.env.local`:

```
NEXT_PUBLIC_ASSAY_API=http://localhost:4317
```

The mock has no dependencies and reads a committed fixture, so it runs on a
clean clone before `pnpm install` finishes. Switching to the real API is one env
var — no code change.

Every state you need, on demand:

```bash
ASSAY_MOCK_WINDOW=open     pnpm mock   # ~66h left
ASSAY_MOCK_WINDOW=closing  pnpm mock   # ~18h left. Default. Record here.
ASSAY_MOCK_WINDOW=expired  pnpm mock   # the right has lapsed
ASSAY_MOCK_WINDOW=fixed    pnpm mock   # frozen clock, deterministic screenshots

ASSAY_MOCK_LATENCY_MS=1200 pnpm mock   # build loading states honestly
ASSAY_MOCK_FAIL=getCeiling pnpm mock   # build the panel-error state
ASSAY_MOCK_EMPTY=1         pnpm mock   # empty settlement list
```

Other useful commands:

```bash
pnpm test          # reproduces section 3's table to the rupee
pnpm verify:mock   # every endpoint against the shared contract
```

Repo files worth knowing: `API_CONTRACT.md` (conventions and the ten API
invariants), `FRONTEND.md` (the short version of this file),
`docs/wireframes.html` (low-fidelity wireframes),
`packages/contract/src/contract.ts` (the schemas themselves).

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **Settlement** | The transfer of collected money from the gateway to the merchant's bank account, net of everything deducted |
| **Capture** | The moment a payment is confirmed and the money is owed to the merchant. Gross captured is the sum of these for a cycle |
| **Gross → net** | Gross captured minus every fee, tax, refund and chargeback equals net credited |
| **MDR** | Merchant Discount Rate — the percentage a merchant pays on a transaction. Set per rail; zero by statute on some |
| **bps** | Basis points. 100 bps = 1%. A flat 2% plan is 200 bps |
| **UPI** | India's real-time payment rail. Crucially, "UPI" covers several sub-types with different MDR, and merchant reports collapse them into one label |
| **RuPay** | India's domestic card network. RuPay *debit* carries zero MDR by statute; RuPay *credit on UPI* does not |
| **PPI** | Prepaid Payment Instrument — a wallet. On UPI it carries 1.1% above ₹2,000 |
| **BIN** | Bank Identification Number — the card's leading digits, which identify its tier (debit, credit, commercial, international). Different tiers carry different interchange |
| **Interchange** | The share of MDR that goes to the card-issuing bank |
| **Chargeback** | A customer disputes a payment through their bank; the principal is reversed and the merchant is charged a handling fee |
| **On-demand / instant settlement** | The merchant asks to be paid before the normal cycle, for a fee. Assay reads that fee from the rail's response, never from a rate card |
| **GST** | India's goods and services tax. 18% on gateway fees — levied on the fee, not on the transaction value |
| **PSSA §10A** | Payment and Settlement Systems Act — bars charges on prescribed electronic payment modes |
| **§269SU** | Income-tax Act section prescribing those modes: UPI from a bank account, RuPay debit |
| **The 3-day window** | The contractual period in which a merchant may report a settlement discrepancy. The product's whole reason to exist |
| **Reconcile** | The lines sum to the credited amount, exactly |
| **Verifiable basis** | The merchant could check the rule behind a number from fields she is actually given. Distinct from reconciling |
| **Explainability ceiling** | The share of a delta that can be verified at all, given the fields merchants receive. The product's finding |

---

## 14. Never do these

- Do not build a landing page, a settings screen, an auth flow, or a settlement
  list. They are out of scope.
- Do not point the interface at a named provider's real statement. Assay is
  gateway-agnostic and runs on synthetic data.
- Do not present the constructed scenario as a real merchant's data.
- Do not write copy that implies a gateway is concealing fees.
- Do not add a control that sends, files or submits anything.
- Do not compute a rupee figure in the frontend. Every number is served.
- Do not hardcode a fee rate anywhere in the UI.
- Do not show a confidence, accuracy or error figure for the forecast until a
  backtest has actually run.

---
## Appendix A — full `explanation` payload

`GET /v1/settlements/stl_2608mera01/explanation` → `data`. Captured from the
mock with `ASSAY_MOCK_WINDOW=fixed`. Use this as your fixture.

```json
{
  "settlementId": "stl_2608mera01",
  "cycleId": "cyc_202608",
  "cycleLabel": "August 2026",
  "periodStart": 1785522600000,
  "periodEnd": 1788200999999,
  "settledAt": 1788413400000,
  "merchant": {
    "id": "mer_meera01",
    "name": "Meera",
    "segment": "D2C skincare, ₹12L/month",
    "plan": {
      "label": "Flat 2% — all instruments",
      "headlineBps": 200,
      "citation": {
        "kind": "policy_line",
        "label": "policy P-01",
        "sourceId": "P-01",
        "title": "Gateway fee — flat plan, all instruments",
        "quote": "A flat 2.00% of the captured amount, applied uniformly to every payment instrument.",
        "url": null,
        "approvedAt": 1788495300000,
        "approvedBy": "javeria.taj"
      }
    },
    "constructed": true
  },
  "grossCaptured": 120000000,
  "netCredited": 112891800,
  "merchantExpected": 114400000,
  "expectationBasis": "gross − 2% − refunds",
  "unexplainedGap": 1508200,
  "lines": [
    {
      "id": "L-00",
      "kind": "gross_captured",
      "label": "Gross captured",
      "amount": 120000000,
      "runningBalance": 120000000,
      "count": 960,
      "unitAmount": null,
      "basis": {
        "formula": "sum(payment.amount) over payments captured in the cycle",
        "inputs": [
          {
            "label": "Captured payments",
            "value": "960"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "api_field",
        "label": "API · payments",
        "sourceId": "payment.amount",
        "title": "Gross captured, summed over captured payments in the cycle",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      },
      "onMerchantReport": true,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    {
      "id": "L-01",
      "kind": "gateway_fee",
      "label": "Gateway fee at 2%",
      "amount": -2400000,
      "runningBalance": 117600000,
      "count": null,
      "unitAmount": null,
      "basis": {
        "formula": "2.00% × gross captured",
        "inputs": [
          {
            "label": "Gross captured",
            "value": "₹12,00,000.00"
          },
          {
            "label": "Plan rate",
            "value": "200 bps, flat, all instruments"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "policy_line",
        "label": "policy P-01",
        "sourceId": "P-01",
        "title": "Gateway fee — flat plan, all instruments",
        "quote": "A flat 2.00% of the captured amount, applied uniformly to every payment instrument.",
        "url": null,
        "approvedAt": 1788495300000,
        "approvedBy": "javeria.taj"
      },
      "onMerchantReport": true,
      "amountReconciled": true,
      "basisVerifiable": false,
      "unverifiableReason": "The total is checkable; its composition is not. This fee is levied across five rails carrying different statutory MDR, and three of them are reported to you identically as \"UPI\". Nothing you are given lets you check which rupee sat on which rail."
    },
    {
      "id": "L-02",
      "kind": "refund_principal",
      "label": "Refunds issued (principal)",
      "amount": -3200000,
      "runningBalance": 114400000,
      "count": 41,
      "unitAmount": null,
      "basis": {
        "formula": "sum(refund.amount) over refunds settled in the cycle",
        "inputs": [
          {
            "label": "Refunds settled",
            "value": "41"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "api_field",
        "label": "API · refunds",
        "sourceId": "refund.amount",
        "title": "Refund principal, summed from the refunds collection",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      },
      "onMerchantReport": true,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    {
      "id": "L-03",
      "kind": "tax_on_fees",
      "label": "GST at 18% on the fee",
      "amount": -432000,
      "runningBalance": 113968000,
      "count": null,
      "unitAmount": null,
      "basis": {
        "formula": "18% × gateway fee",
        "inputs": [
          {
            "label": "Gateway fee",
            "value": "₹24,000.00"
          },
          {
            "label": "GST rate",
            "value": "18%"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "policy_line",
        "label": "policy P-02",
        "sourceId": "P-02",
        "title": "GST at 18% on payment-gateway fees",
        "quote": "Goods and Services Tax at 18% is levied on the gateway fee, not on the transaction value.",
        "url": null,
        "approvedAt": 1788495300000,
        "approvedBy": "javeria.taj"
      },
      "onMerchantReport": true,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    {
      "id": "L-04",
      "kind": "failed_payment_fee",
      "label": "Failed-payment charges",
      "amount": -330000,
      "runningBalance": 113638000,
      "count": 1100,
      "unitAmount": 300,
      "basis": {
        "formula": "1,100 failed attempts × ₹3",
        "inputs": [
          {
            "label": "Failed authorisation attempts",
            "value": "1,100"
          },
          {
            "label": "Charge per attempt",
            "value": "₹3.00"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "policy_line",
        "label": "policy P-03",
        "sourceId": "P-03",
        "title": "Failed-payment charge, per attempt",
        "quote": "A fixed charge of ₹3 per failed authorisation attempt.",
        "url": null,
        "approvedAt": 1788495300000,
        "approvedBy": "javeria.taj"
      },
      "onMerchantReport": false,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    {
      "id": "L-05",
      "kind": "chargeback_principal",
      "label": "Chargebacks (principal)",
      "amount": -540000,
      "runningBalance": 113098000,
      "count": 2,
      "unitAmount": 270000,
      "basis": {
        "formula": "2 disputes × ₹2,700",
        "inputs": [
          {
            "label": "Disputes raised",
            "value": "2"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "api_field",
        "label": "API · disputes",
        "sourceId": "dispute.amount",
        "title": "Chargeback principal, summed from the disputes collection",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      },
      "onMerchantReport": true,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    {
      "id": "L-06",
      "kind": "chargeback_fee",
      "label": "Chargeback fees",
      "amount": -100000,
      "runningBalance": 112998000,
      "count": 2,
      "unitAmount": 50000,
      "basis": {
        "formula": "2 disputes × ₹500",
        "inputs": [
          {
            "label": "Disputes raised",
            "value": "2"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "policy_line",
        "label": "policy P-04",
        "sourceId": "P-04",
        "title": "Chargeback handling fee, per dispute",
        "quote": "A fixed fee of ₹500 for each dispute raised against a captured payment.",
        "url": null,
        "approvedAt": 1788495300000,
        "approvedBy": "javeria.taj"
      },
      "onMerchantReport": false,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    {
      "id": "L-07",
      "kind": "instant_settlement_fee",
      "label": "On-demand settlement fee",
      "amount": -106200,
      "runningBalance": 112891800,
      "count": null,
      "unitAmount": null,
      "basis": {
        "formula": "settlement.fees + settlement.tax, read from the rail's response",
        "inputs": [
          {
            "label": "Amount settled on demand",
            "value": "₹3,00,000.00"
          },
          {
            "label": "settlement.fees",
            "value": "₹900.00"
          },
          {
            "label": "settlement.tax",
            "value": "₹162.00"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "api_field",
        "label": "API · fees + tax",
        "sourceId": "settlement.fees, settlement.tax",
        "title": "On-demand settlement fee, read from the rail's own response",
        "quote": "Read verbatim from the settlement object's fees and tax fields. Assay does not hold a rate for this line: §4.1 — rupees come from what the rail returned, never from a rate table we typed in.",
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      },
      "onMerchantReport": false,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    {
      "id": "L-08",
      "kind": "net_credited",
      "label": "Actually credited",
      "amount": 0,
      "runningBalance": 112891800,
      "count": null,
      "unitAmount": null,
      "basis": {
        "formula": "signed sum of every line above",
        "inputs": [
          {
            "label": "Lines",
            "value": "8"
          }
        ],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "derived",
        "label": "derived",
        "sourceId": "waterfall.sum",
        "title": "Net credited — the signed sum of every line above, in deterministic code",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      },
      "onMerchantReport": true,
      "amountReconciled": true,
      "basisVerifiable": true,
      "unverifiableReason": null
    }
  ],
  "instrumentMix": [
    {
      "instrument": "upi_bank_account",
      "displayLabel": "UPI — bank account",
      "reportedAs": "UPI",
      "grossCaptured": 72000000,
      "paymentCount": 640,
      "networkMdrBps": 0,
      "feeCharged": 1440000,
      "collapsedInReport": true,
      "citation": {
        "kind": "statute",
        "label": "PSSA §10A",
        "sourceId": "PSSA-10A",
        "title": "Payment and Settlement Systems Act §10A — no charge on prescribed electronic modes",
        "quote": "No bank or system provider shall impose any charge upon anyone, either directly or indirectly, for using the electronic modes of payment prescribed under section 269SU of the Income-tax Act, 1961.",
        "url": "https://razorpay.com/terms/",
        "approvedAt": null,
        "approvedBy": null
      }
    },
    {
      "instrument": "upi_rupay_credit",
      "displayLabel": "UPI — RuPay credit card",
      "reportedAs": "UPI",
      "grossCaptured": 12000000,
      "paymentCount": 85,
      "networkMdrBps": 200,
      "feeCharged": 240000,
      "collapsedInReport": true,
      "citation": {
        "kind": "derived",
        "label": "field missing",
        "sourceId": "FIELD-instrument_subtype",
        "title": "Three UPI rails with different statutory MDR, all reported as \"UPI\"",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      }
    },
    {
      "instrument": "upi_ppi",
      "displayLabel": "UPI — wallet / PPI",
      "reportedAs": "UPI",
      "grossCaptured": 6000000,
      "paymentCount": 55,
      "networkMdrBps": 110,
      "feeCharged": 120000,
      "collapsedInReport": true,
      "citation": {
        "kind": "derived",
        "label": "field missing",
        "sourceId": "FIELD-instrument_subtype",
        "title": "Three UPI rails with different statutory MDR, all reported as \"UPI\"",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      }
    },
    {
      "instrument": "card_credit",
      "displayLabel": "Cards",
      "reportedAs": "Card",
      "grossCaptured": 24000000,
      "paymentCount": 145,
      "networkMdrBps": 180,
      "feeCharged": 480000,
      "collapsedInReport": true,
      "citation": {
        "kind": "derived",
        "label": "field missing",
        "sourceId": "FIELD-card_bin_tier",
        "title": "Card BIN tier is not present in merchant-facing reports",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      }
    },
    {
      "instrument": "netbanking",
      "displayLabel": "Netbanking",
      "reportedAs": "Netbanking",
      "grossCaptured": 6000000,
      "paymentCount": 35,
      "networkMdrBps": 0,
      "feeCharged": 120000,
      "collapsedInReport": false,
      "citation": {
        "kind": "derived",
        "label": "field missing",
        "sourceId": "FIELD-per_line_fee_basis",
        "title": "Per-line fee basis is not present in merchant-facing reports",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      }
    }
  ],
  "reconciliation": {
    "ok": true,
    "computedNet": 112891800,
    "statedNet": 112891800,
    "delta": 0
  },
  "policyId": "pol_flat2pc01"
}
```

---

## Appendix B — `ceiling` and `window` payloads

`GET /v1/settlements/stl_2608mera01/ceiling` → `data`

```json
{
  "settlementId": "stl_2608mera01",
  "totalDelta": 7108200,
  "amountReconciled": {
    "amount": 7108200,
    "share": 1
  },
  "amountUnreconciled": {
    "amount": 0,
    "share": 0
  },
  "basisVerifiable": {
    "amount": 4708200,
    "share": 0.6624
  },
  "basisUnverifiable": {
    "amount": 2400000,
    "share": 0.3376
  },
  "missingFields": [
    {
      "id": "instrument_subtype",
      "name": "Instrument sub-type",
      "whyItMatters": "Bank-account UPI carries 0% network MDR by statute, RuPay credit on UPI around 2%, and PPI on UPI 1.1% above ₹2,000. All three arrive in merchant reports labelled identically as \"UPI\", so no merchant can check which rail carried which rupee.",
      "wouldResolve": 1800000,
      "citation": {
        "kind": "derived",
        "label": "field missing",
        "sourceId": "FIELD-instrument_subtype",
        "title": "Three UPI rails with different statutory MDR, all reported as \"UPI\"",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      }
    },
    {
      "id": "card_bin_tier",
      "name": "Card BIN tier",
      "whyItMatters": "Debit, credit, commercial and international BINs carry materially different interchange, and the tier is not surfaced on the merchant's report — so the card slice of the fee cannot be checked against any published rate.",
      "wouldResolve": 480000,
      "citation": {
        "kind": "derived",
        "label": "field missing",
        "sourceId": "FIELD-card_bin_tier",
        "title": "Card BIN tier is not present in merchant-facing reports",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      }
    },
    {
      "id": "per_line_fee_basis",
      "name": "Per-line fee basis",
      "whyItMatters": "Each fee line states an amount but not the base it was computed on, so a merchant cannot distinguish an ad-valorem charge from a flat per-transaction one, or verify either.",
      "wouldResolve": 120000,
      "citation": {
        "kind": "derived",
        "label": "field missing",
        "sourceId": "FIELD-per_line_fee_basis",
        "title": "Per-line fee basis is not present in merchant-facing reports",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      }
    }
  ],
  "headline": "Every rupee reconciles. ₹24,000 of it — 33.8% — you have no way to check.",
  "method": "Two deterministic passes over the settlement's own lines. The first asserts each amount against the rail's figures. The second asks whether the rule behind that amount is derivable from the fields present in the merchant's own reports. No model runs in either pass; the model's only job was parsing the rate card into the policy a human then approved.",
  "zeroMdrExposure": {
    "grossOnZeroMdrRails": 72000000,
    "feeLeviedOnZeroMdrRails": 1440000,
    "annualisedFee": 17280000,
    "note": "₹7,20,000 of this cycle moved on a rail that carries zero network MDR by statute — UPI from a bank account. Under a flat 2% plan that slice still attracted ₹14,400 of fee. This is legal, disclosed in the plan, and invisible on the report: nothing Meera is given tells her the slice exists. Counted here only for rails where zero MDR is mandated by statute (UPI from a bank account, RuPay debit) — netbanking is excluded, as it carries a flat per-transaction bank charge rather than an ad-valorem MDR.",
    "citations": [
      {
        "kind": "statute",
        "label": "PSSA §10A",
        "sourceId": "PSSA-10A",
        "title": "Payment and Settlement Systems Act §10A — no charge on prescribed electronic modes",
        "quote": "No bank or system provider shall impose any charge upon anyone, either directly or indirectly, for using the electronic modes of payment prescribed under section 269SU of the Income-tax Act, 1961.",
        "url": "https://razorpay.com/terms/",
        "approvedAt": null,
        "approvedBy": null
      },
      {
        "kind": "statute",
        "label": "IT Act §269SU",
        "sourceId": "IT-269SU",
        "title": "Income-tax Act §269SU — prescribed electronic modes (UPI, RuPay debit)",
        "quote": null,
        "url": "https://razorpay.com/terms/",
        "approvedAt": null,
        "approvedBy": null
      }
    ]
  }
}
```

`GET /v1/settlements/stl_2608mera01/window` → `data`. Note `serverNow`:
the countdown is computed from the offset between this and the browser clock.

```json
{
  "settlementId": "stl_2608mera01",
  "settledAt": 1788413400000,
  "deadlineAt": 1788672600000,
  "serverNow": 1788607800000,
  "msRemaining": 64800000,
  "status": "closing",
  "closingThresholdMs": 86400000,
  "clause": {
    "kind": "statute",
    "label": "T&C Part B",
    "sourceId": "TNC-PART-B-DISCREPANCY",
    "title": "Discrepancy reporting window",
    "quote": "In case of discrepancies, You shall report to Razorpay PA regarding such discrepancy within three (3) days upon the receipt of the fund settlements.",
    "url": "https://razorpay.com/terms/",
    "approvedAt": null,
    "approvedBy": null
  }
}
```

---

## Appendix C — the discrepancy report

`GET /v1/settlements/stl_2608mera01/report` → `data`.

**Subject:** `Settlement discrepancy — August 2026 cycle (stl_2608mera01)`

**Body** — render verbatim, preformatted, in a monospaced face:

```
Reporting a discrepancy on the settlement received for the August 2026 cycle,
within the three-day window set out in the terms.

Amount credited: ₹11,28,918.00
Amount expected on the stated plan (gross − 2% − refunds): ₹11,44,000.00
Difference: ₹15,082.00

The following lines account for the difference. Each is reconciled against
the figures returned for this settlement:

  GST at 18% on the gateway fee            ₹4,320.00
  Failed-payment charges, 1,100 × ₹3       ₹3,300.00
  Chargebacks, 2 × ₹2,700 principal        ₹5,400.00
  Chargeback fees, 2 × ₹500                ₹1,000.00
  On-demand settlement fee                 ₹1,062.00

Three of these five lines are not itemised anywhere in the reports available
to me, which is why the difference was not identified at the time of credit.

Separately, and not disputed here: ₹24,000.00 of gateway fee was charged
across five rails carrying different statutory network MDR, three of which
are reported identically as "UPI". I am unable to verify the composition of
that fee from any field made available to me, and would ask that the
instrument sub-type and per-line fee basis be included in future reports.

Requesting confirmation of the five lines above within the reporting window.
```

**Claims** — `disputedTotal` is 1508200 paise (₹15,082.00), and the five claim
amounts sum to exactly that:

| Line | Statement | Amount (paise) | Cited to |
|---|---|---:|---|
| `L-03` | GST at 18% on the gateway fee | 432000 | `policy P-02` |
| `L-04` | Failed-payment charges, 1,100 × ₹3 | 330000 | `policy P-03` |
| `L-05` | Chargebacks, 2 × ₹2,700 principal | 540000 | `API · disputes` |
| `L-06` | Chargeback fees, 2 × ₹500 | 100000 | `policy P-04` |
| `L-07` | On-demand settlement fee | 106200 | `API · fees + tax` |

---

## Appendix D — `forecast` and `policy` payloads

`GET /v1/forecast/current` → `data`. `projectedLines` is trimmed here — each
entry is an `ExplanationLine`, the same shape as the waterfall.

```json
{
  "cycleId": "cyc_202609",
  "asOf": 1788607800000,
  "expectedSettlementAt": 1791005400000,
  "capturedSoFar": 41000000,
  "projectedNet": 39018400,
  "projectedLines": [
    {
      "id": "F-00",
      "kind": "gross_captured",
      "label": "Captured so far",
      "amount": 41000000,
      "runningBalance": 41000000,
      "count": null,
      "unitAmount": null,
      "basis": {
        "formula": "sum(payment.amount), cycle to date",
        "inputs": [],
        "computedBy": "deterministic"
      },
      "citation": {
        "kind": "api_field",
        "label": "API · payments",
        "sourceId": "payment.amount",
        "title": "Gross captured, summed over captured payments in the cycle",
        "quote": null,
        "url": null,
        "approvedAt": null,
        "approvedBy": null
      },
      "onMerchantReport": false,
      "amountReconciled": false,
      "basisVerifiable": true,
      "unverifiableReason": null
    },
    "… four more ExplanationLine objects, same shape …"
  ],
  "backtest": {
    "method": "policy_engine_replay",
    "cycles": 0,
    "medianAbsError": 0,
    "maxAbsError": 0,
    "note": "Not yet backtested. The synthetic generator (J-B4) has not been run against this policy. The UI must render this as 'accuracy not yet measured' — never as zero error."
  }
}
```

`GET /v1/policy` → `data`. Citation chips link here; `P-05` is the one that
holds no rate at all because the rail supplies the figure.

```json
{
  "id": "pol_flat2pc01",
  "version": "2026-09-04.1",
  "label": "Flat 2% merchant plan — constructed scenario",
  "sourceDocuments": [
    {
      "title": "Razorpay Terms & Conditions",
      "url": "https://razorpay.com/terms/"
    },
    {
      "title": "Payment and Settlement Systems Act, §10A",
      "url": null
    },
    {
      "title": "Income-tax Act, §269SU",
      "url": null
    },
    {
      "title": "Merchant pricing plan (constructed for this scenario)",
      "url": null
    }
  ],
  "approvedBy": "javeria.taj",
  "approvedAt": 1788495300000,
  "lines": [
    {
      "id": "P-01",
      "label": "Gateway fee — flat plan",
      "appliesTo": "every captured payment, all instruments",
      "rateBps": 200,
      "fixedAmount": null,
      "readFromApi": null,
      "quote": "A flat 2.00% of the captured amount, applied uniformly to every payment instrument.",
      "url": null,
      "parsedBy": "model",
      "approved": true,
      "approvedBy": "javeria.taj",
      "approvedAt": 1788495300000,
      "provenance": "constructed"
    },
    {
      "id": "P-02",
      "label": "GST on fees",
      "appliesTo": "all gateway fees",
      "rateBps": 1800,
      "fixedAmount": null,
      "readFromApi": null,
      "quote": "Goods and Services Tax at 18% is levied on the gateway fee, not on the transaction value.",
      "url": null,
      "parsedBy": "model",
      "approved": true,
      "approvedBy": "javeria.taj",
      "approvedAt": 1788495300000,
      "provenance": "documented"
    },
    {
      "id": "P-03",
      "label": "Failed-payment charge",
      "appliesTo": "each failed authorisation attempt",
      "rateBps": null,
      "fixedAmount": 300,
      "readFromApi": null,
      "quote": "A fixed charge of ₹3 per failed authorisation attempt.",
      "url": null,
      "parsedBy": "model",
      "approved": true,
      "approvedBy": "javeria.taj",
      "approvedAt": 1788495300000,
      "provenance": "constructed"
    },
    {
      "id": "P-04",
      "label": "Chargeback handling fee",
      "appliesTo": "each dispute raised",
      "rateBps": null,
      "fixedAmount": 50000,
      "readFromApi": null,
      "quote": "A fixed fee of ₹500 for each dispute raised against a captured payment.",
      "url": null,
      "parsedBy": "model",
      "approved": true,
      "approvedBy": "javeria.taj",
      "approvedAt": 1788495300000,
      "provenance": "constructed"
    },
    {
      "id": "P-05",
      "label": "On-demand settlement fee",
      "appliesTo": "each on-demand settlement",
      "rateBps": null,
      "fixedAmount": null,
      "readFromApi": "settlement.fees + settlement.tax",
      "quote": "No rate is held for this line. The fee and its tax are read from the settlement object returned by the rail. §4.1: a rate we typed in is a rate that can go stale on camera.",
      "url": null,
      "parsedBy": "model",
      "approved": true,
      "approvedBy": "javeria.taj",
      "approvedAt": 1788495300000,
      "provenance": "documented"
    },
    {
      "id": "P-06",
      "label": "Zero network MDR — prescribed electronic modes",
      "appliesTo": "UPI from a bank account, RuPay debit",
      "rateBps": 0,
      "fixedAmount": null,
      "readFromApi": null,
      "quote": "No bank or system provider shall impose any charge upon anyone, either directly or indirectly, for using the electronic modes of payment prescribed under section 269SU of the Income-tax Act, 1961.",
      "url": "https://razorpay.com/terms/",
      "parsedBy": "model",
      "approved": true,
      "approvedBy": "javeria.taj",
      "approvedAt": 1788495300000,
      "provenance": "documented"
    }
  ]
}
```

---

*End of `assay_context.md`. If something you need is not in this file,
it has not been decided — ask rather than inventing it.*
