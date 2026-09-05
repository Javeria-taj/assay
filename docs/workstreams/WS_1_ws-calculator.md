# WS-1 — Policy engine and settlement calculator (the rupee gate)

**Wave 1 · starts 17:45 · counter read at 18:00, 18:30, 18:45 · hard target 20:15 · 150 minutes · NOT cuttable**

**Done means:** `calculate(MEERA_CYCLE, COMMITTED_POLICY)` returns an `Explanation` that
reproduces the worked example to the paise, prints `TIER-1 34/34`, and by 20:15 satisfies
`assert.deepEqual(calculate(MEERA_CYCLE, COMMITTED_POLICY), F.EXPLANATION)`.

---

## 1. Preconditions

This session cannot start until WS-0's first commit (T+15) has landed. Before writing a line,
confirm these exist and read them:

- `apps/api/src/domain/raw.ts` — `RawCycle`, `RawPayment`, `RawRefund`, `RawDispute`,
  `RawFailedAttempt`, `RawSettlementFacts`
- `apps/api/src/domain/lines.ts` — `LineDraft`, `seal(drafts, statedNet)`, `ReconcileError`
- `apps/api/src/domain/meera.ts` — `MEERA_CYCLE`
- `apps/api/src/domain/committed-policy.ts` — `COMMITTED_POLICY`
- `apps/api/src/domain/attribution.ts` — `attributionOf`, `isStatutoryZeroMdr`, `MissingFieldId`
- `apps/api/src/domain/copy.ts` — `GATEWAY_FEE_UNVERIFIABLE_REASON`
- `apps/api/src/domain/README.md` — the amendment protocol

If `lines.ts` has not landed, write `apps/api/test/calculator.test.ts` first (section 6) — it
depends only on `@assay/contract` fixtures and `MEERA_CYCLE`, and the 18:00 counter read needs
it to exist and run.

Also read, and treat as frozen law:
`packages/contract/src/contract.ts`, `packages/contract/src/money.ts`,
`packages/contract/src/fixtures.ts`, `packages/contract/src/reconcile.test.ts`.

---

## 2. The brief

> You own the settlement calculator. Your input is a `RawCycle` and an approved `Policy`.
> Your output is a contract-valid `Explanation`. You are pure functions: no HTTP, no env, no
> clock, no randomness, no I/O. Another agent assembles you into routes.
>
> ### 2.1 First twenty minutes: the aggregation decision, written down before any arithmetic
>
> Before you write a single expression, put a doc comment at the top of
> `apps/api/src/engine/policy-apply.ts` headed `AGGREGATION LEVEL — decided 17:45, do not
> relitigate`. It must state, in prose, the answer to: *at what level of aggregation does each
> policy line apply?* This ambiguity is the likeliest way to lose the night, because
> `Σ bps(payment, 200)` over 960 payments does not in general equal `bps(Σ payment, 200)`.
>
> The decisions, which are already made — write them down, do not re-derive them:
>
> - **P-01 (gateway fee) applies per instrument slice.** The cycle's gateway fee is
>   **defined as** `Σ slice.feeCharged`, not as `bps(grossCaptured, 200)`. This makes the
>   invariant "the instrument mix decomposes the fee exactly" structural rather than lucky:
>   it cannot be broken by a rounding residue at any future slice mix. That the two happen to
>   be equal for Meera is asserted as a *test*, never used as a *definition*.
> - **P-02 (GST) applies to the cycle-aggregate gateway fee** — one `bps()` call on the summed
>   fee, matching `bps(GATEWAY_FEE, 1800)`. Per-slice GST summed would round differently and
>   would not reproduce ₹4,320.
> - **P-03 and P-04 are integer `count × unitAmount`.** Never a rate, never a bps call.
> - **P-05 is `readFromApi`.** Sum `RawSettlementFacts.feesPaise + RawSettlementFacts.taxPaise`.
>   Assert at runtime that `P-05.rateBps === null` and
>   `P-05.readFromApi === "settlement.fees + settlement.tax"`. There is no on-demand rate
>   anywhere in this codebase and you must not introduce one.
> - **Refund principal and chargeback principal come off the raw collections**, not off policy.
>
> ### 2.2 `apps/api/src/engine/policy-apply.ts`
>
> The only thing in this stream that touches a `Policy`. Exports:
>
> ```ts
> export class PolicyNotApprovedError extends Error {
>   readonly code = "policy_not_approved";
>   constructor(readonly lineId: string);
> }
>
> export interface AppliedPolicy {
>   readonly policy: Policy;
>   /** Throws PolicyNotApprovedError if the line's approved !== true. */
>   line(id: string): PolicyLine;
>   /** bps rate. Throws if rateBps is null. */
>   rate(id: string): number;
>   /** fixed amount in paise. Throws if fixedAmount is null. */
>   fixed(id: string): Paise;
>   /** the readFromApi expression. Throws if null, or if rateBps is not null. */
>   readFromApi(id: string): string;
> }
>
> export function applyPolicy(policy: Policy): AppliedPolicy;
> ```
>
> `applyPolicy` validates every line up front: any `PolicyLine` reaching the engine with
> `approved !== true` raises `PolicyNotApprovedError` immediately, before a single rupee is
> computed. A missing line id raises a plain `Error` naming the id. This is the runtime half of
> the rule; the type half lives in `Engine.policy(): Policy` in the seam.
>
> Also export these four named helpers so no arithmetic is inline in `calculate.ts`:
>
> ```ts
> export function gatewayFeeForSlice(grossPaise: Paise, p: AppliedPolicy): Paise;   // bps(gross, p.rate("P-01"))
> export function taxOnFees(totalFeePaise: Paise, p: AppliedPolicy): Paise;         // bps(totalFee, p.rate("P-02"))
> export function perEventFee(count: number, lineId: string, p: AppliedPolicy): Paise; // count * p.fixed(lineId)
> export function onDemandFee(facts: RawSettlementFacts, p: AppliedPolicy): Paise;  // facts.feesPaise + facts.taxPaise
> ```
>
> `onDemandFee` performs the P-05 assertions described above before returning.
>
> **Use `bps()` and `rupees()` from `@assay/contract` exclusively.** This stream owns no
> arithmetic of its own. No `Math.round`, no `/ 10_000`, no `* 100` anywhere in these files.
>
> ### 2.3 `apps/api/src/engine/instrument-mix.ts`
>
> Projects `RawCycle.payments` into `InstrumentSlice[]`. Exports:
>
> ```ts
> export const INSTRUMENT_ORDER: readonly Instrument[];
> export function instrumentMix(cycle: RawCycle, p: AppliedPolicy): InstrumentSlice[];
> ```
>
> `INSTRUMENT_ORDER` is exactly, in this order:
> `["upi_bank_account", "upi_rupay_credit", "upi_ppi", "card_debit", "card_credit", "netbanking", "wallet"]`.
> Emit slices in that order, **skipping any instrument with zero payments in the cycle**. For
> `MEERA_CYCLE` this yields five slices in the fixture's own order.
>
> Per slice: `grossCaptured = Σ payment.amountPaise` for that instrument;
> `paymentCount = ` the count; `feeCharged = gatewayFeeForSlice(grossCaptured, p)`.
>
> Static metadata tables, keyed on `Instrument`:
>
> | instrument | displayLabel | reportedAs | networkMdrBps | citation |
> |---|---|---|---:|---|
> | `upi_bank_account` | `UPI — bank account` | `UPI` | 0 | `CITATIONS.zeroMdrStatute` |
> | `upi_rupay_credit` | `UPI — RuPay credit card` | `UPI` | 200 | `CITATIONS.upiCollapse` |
> | `upi_ppi` | `UPI — wallet / PPI` | `UPI` | 110 | `CITATIONS.upiCollapse` |
> | `card_debit` | `Cards` | `Card` | 90 | `CITATIONS.binTier` |
> | `card_credit` | `Cards` | `Card` | 180 | `CITATIONS.binTier` |
> | `netbanking` | `Netbanking` | `Netbanking` | 0 | `CITATIONS.feeBasis` |
> | `wallet` | `Wallet` | `Wallet` | 0 | `CITATIONS.feeBasis` |
>
> The dashes in `UPI — bank account`, `UPI — RuPay credit card` and `UPI — wallet / PPI` are
> em-dashes (U+2014) with a space either side. Copy them from `fixtures.ts`; do not retype.
> The citation is keyed on **`instrument`**, not on `reportedAs` — `upi_bank_account` cites the
> statute while the other two UPI rails cite the collapse, and that asymmetry is deliberate.
>
> **`networkMdrBps` is descriptive metadata. It is rendered and it is read by WS-3; it never
> multiplies anything in this stream.** Put that sentence in a doc comment above the table, so
> nobody later mistakes it for a rate we compute rupees from. §4.1 is not violated by it.
>
> **`collapsedInReport` — this is a trap, read carefully.** The obvious rule ("true when another
> slice in this cycle shares my `reportedAs`") gives `card_credit: false` and **fails the
> fixture**, which has `card_credit.collapsedInReport === true` despite being the only Card
> slice. The collapse is about the label hiding a sub-type dimension that exists in the world,
> not about which slices happen to be present tonight. Use the seam:
>
> ```ts
> collapsedInReport: attributionOf(draftSlice) !== "per_line_fee_basis"
> ```
>
> `attributionOf` keys only on `reportedAs` ("UPI" → `instrument_subtype`, "Card" →
> `card_bin_tier`, everything else → `per_line_fee_basis`), so build the slice with a
> placeholder `collapsedInReport: false`, call `attributionOf`, then set the real value. Do not
> reimplement that mapping — it is WS-3's shared data and duplicating it will drift.
>
> ### 2.4 `apps/api/src/engine/calculate.ts`
>
> ```ts
> export function calculate(cycle: RawCycle, policy: Policy): Explanation;
> ```
>
> Emit exactly nine `LineDraft`s (`LineDraft = Omit<ExplanationLine, "runningBalance">`, from
> the seam) in the fixed order L-00 … L-08, pass them through `seal(drafts, cycle.statedNetPaise)`,
> and assemble the `Explanation`. Section 4 below gives every field of every line verbatim.
>
> **Citations come from `CITATIONS` imported from `@assay/contract`.** Import the object and
> reference its members. Do not reconstruct a citation literal, ever — a reconstructed citation
> turns the 20:15 `deepEqual` into a whitespace hunt at 21:00, and that is a night-ender.
> Same for `GATEWAY_FEE_UNVERIFIABLE_REASON`: import it from `apps/api/src/domain/copy.ts`.
>
> Refusal paths, both of which propagate out of `calculate` as thrown errors for the route layer
> to map:
> - `ReconcileError` (from `seal`) when `Σ signed lines !== cycle.statedNetPaise`. Do **not**
>   catch it and return an `Explanation` carrying a non-zero delta. A returned `Explanation`
>   always has `reconciliation.delta === 0` and `ok: true`; the non-zero case is a refusal.
> - `PolicyNotApprovedError` when any policy line is unapproved.
>
> Derived strings — compute them, never type them:
> - `"2%"` in the L-01 label: `String(rate / 100)` where `rate = p.rate("P-01")`.
> - `"2.00%"` in the L-01 formula: `(rate / 100).toFixed(2)`.
> - `"18%"` in L-03: `String(p.rate("P-02") / 100)`.
> - `"gross − 2% − refunds"` in `expectationBasis`: the character between the words is a
>   **minus sign U+2212**, not a hyphen. Copy it from `fixtures.ts`.
>
> Counts in `Basis.inputs` are grouped: `1100` renders as `"1,100"`, `960` as `"960"`, `41` as
> `"41"`. Write a tiny local `fmtCount(n: number): string` (or use
> `new Intl.NumberFormat("en-IN")`). Money in `Basis.inputs` goes through `formatPaise` —
> `"₹3.00"` is `formatPaise(300)`, `"₹3"` in a formula is `formatPaise(300, { paise: false })`.
>
> ### 2.5 `tools/invariants/waterfall.ts`
>
> WS-0 ships this as a no-op stub; you fill it. It must not import anything under
> `apps/api/src/engine/**` — it checks a payload, not an implementation, so WS-3 and WS-4 can
> run it over their own output.
>
> ```ts
> export function checkWaterfall(e: Explanation): string[]; // violations; empty array = pass
> ```
>
> - **W1** the signed sum of every non-`net_credited` line equals `e.netCredited`, and
>   `e.reconciliation.delta === 0` and `e.reconciliation.ok === true`
> - **W2** the last line has `kind === "net_credited"`, `amount === 0`, and
>   `runningBalance === e.netCredited`
> - **W3** running balances are non-increasing across the deduction lines (index 1 … n−2)
> - **W4** `Σ instrumentMix.grossCaptured === e.grossCaptured` and
>   `Σ instrumentMix.feeCharged === |amount of the gateway_fee line|`
> - **W5** every line has a non-empty `citation.sourceId`; every line with
>   `basisVerifiable === false` has a non-null `unverifiableReason`, and every line with
>   `basisVerifiable === true` has `unverifiableReason === null`
>
> Each violation string names the line id and the two numbers that disagree, formatted with
> `formatPaise`. Call `checkWaterfall` from your own test and assert it returns `[]`.
>
> ### 2.6 Escalations you should expect to need
>
> The seam froze at 17:45 without enumerating three fields you require. Each is an **additive
> optional field — tier 1: any agent may add it, announce it in one line, do not edit anything
> else in `domain/`.** If the field already exists under a different name, use theirs.
>
> 1. `RawSettlementFacts.onDemandBasePaise: Paise` — L-07's input `"Amount settled on demand"`
>    is `₹3,00,000.00` and there is nowhere else for it to come from.
> 2. `RawCycle` identity: `settlementId`, `cycleId`, `cycleLabel`, `periodStart`, `periodEnd`,
>    `settledAt`. `calculate` must **take these off the cycle**, never mint or hardcode them.
>    `ids.ts` is for the generator and the routes, not for you.
> 3. `RawCycle.merchant` carrying the `Merchant` shape (id, name, segment, plan.headlineBps).
>    Needed only for the 20:15 `deepEqual`, not for the 18:45 gate — do not let it block you.
>
> If any of these turns into a rename or a narrowing, stop and escalate to WS-0's agent; do not
> edit `apps/api/src/domain/**` yourself. `as any` and `@ts-expect-error` are banned in
> `apps/api/src` — reaching for either is the signal to escalate, not to proceed.

---

## 3. Every number, so you never guess

All figures in integer paise. `rupees(x)` = `x * 100`.

| Symbol | Rupees | Paise | Derivation |
|---|---:|---:|---|
| `GROSS_CAPTURED` | ₹12,00,000.00 | 120,000,000 | Σ 960 captured payments |
| `GATEWAY_FEE` | ₹24,000.00 | 2,400,000 | Σ slice.feeCharged (= `bps(gross, 200)`) |
| `REFUND_PRINCIPAL` | ₹32,000.00 | 3,200,000 | Σ 41 refunds |
| `GST_ON_FEES` | ₹4,320.00 | 432,000 | `bps(GATEWAY_FEE, 1800)` |
| `FAILED_FEES` | ₹3,300.00 | 330,000 | 1,100 × `rupees(3)` = 1,100 × 300 |
| `CHARGEBACK_PRINCIPAL` | ₹5,400.00 | 540,000 | 2 × `rupees(2,700)` = 2 × 270,000 |
| `CHARGEBACK_FEES` | ₹1,000.00 | 100,000 | 2 × `rupees(500)` = 2 × 50,000 |
| `INSTANT_API_FEES` | ₹900.00 | 90,000 | `facts.feesPaise` |
| `INSTANT_API_TAX` | ₹162.00 | 16,200 | `facts.taxPaise` |
| `INSTANT_SETTLEMENT_TOTAL` | ₹1,062.00 | 106,200 | fees + tax |
| `INSTANT_SETTLEMENT_BASE` | ₹3,00,000.00 | 30,000,000 | displayed only |
| `NET_CREDITED` | ₹11,28,918.00 | **112,891,800** | gross − all seven deductions |
| `MERCHANT_EXPECTED` | ₹11,44,000.00 | 114,400,000 | gross − `bps(gross, headlineBps)` − refunds |
| `UNEXPLAINED_GAP` | ₹15,082.00 | 1,508,200 | expected − net |
| `TOTAL_DELTA` | ₹71,082.00 | 7,108,200 | gross − net |

`MEERA_CYCLE.statedNetPaise === 112891800`, and it is an **independent input** — never derive it
from your own sum, or `delta === 0` becomes a tautology instead of an assertion.

`MERCHANT_EXPECTED` uses `merchant.plan.headlineBps` (her mental model), **not** P-01. They are
both 200 tonight; keep them separate in code, because collapsing them is what makes the product
unable to ever show a plan that differs from the applied rate.

### Instrument mix

| instrument | gross ₹ | gross paise | payments | networkMdrBps | fee ₹ | fee paise | collapsed |
|---|---:|---:|---:|---:|---:|---:|:--:|
| `upi_bank_account` | 7,20,000 | 72,000,000 | 640 | 0 | 14,400 | 1,440,000 | true |
| `upi_rupay_credit` | 1,20,000 | 12,000,000 | 85 | 200 | 2,400 | 240,000 | true |
| `upi_ppi` | 60,000 | 6,000,000 | 55 | 110 | 1,200 | 120,000 | true |
| `card_credit` | 2,40,000 | 24,000,000 | 145 | 180 | 4,800 | 480,000 | true |
| `netbanking` | 60,000 | 6,000,000 | 35 | 0 | 1,200 | 120,000 | **false** |

Gross sums to 120,000,000. Payments sum to 960. Fees sum to 2,400,000. All three exactly.

---

## 4. The nine lines, field by field

Order is fixed and is the kind order:
`gross_captured, gateway_fee, refund_principal, tax_on_fees, failed_payment_fee,
chargeback_principal, chargeback_fee, instant_settlement_fee, net_credited`.

Every `basis.computedBy` is `"deterministic"`. Every `unverifiableReason` is `null` except L-01.

**L-00** · `gross_captured` · label `Gross captured` · amount `+120000000` ·
count `cycle.payments.length` (960) · unitAmount `null` ·
formula `sum(payment.amount) over payments captured in the cycle` ·
inputs `[{ label: "Captured payments", value: "960" }]` · citation `CITATIONS.capturedApi` ·
onMerchantReport **true** · amountReconciled true · basisVerifiable true

**L-01** · `gateway_fee` · label `Gateway fee at 2%` · amount `-2400000` ·
count `null` · unitAmount `null` · formula `2.00% × gross captured` ·
inputs `[{ label: "Gross captured", value: "₹12,00,000.00" }, { label: "Plan rate", value: "200 bps, flat, all instruments" }]` ·
citation `CITATIONS.planFee` · onMerchantReport **true** · amountReconciled true ·
basisVerifiable **false** · unverifiableReason `GATEWAY_FEE_UNVERIFIABLE_REASON`
(the "₹200 bps" input string is `` `${rate} bps, flat, all instruments` ``; the `×` is U+00D7)

**L-02** · `refund_principal` · label `Refunds issued (principal)` · amount `-3200000` ·
count `cycle.refunds.length` (41) · unitAmount `null` ·
formula `sum(refund.amount) over refunds settled in the cycle` ·
inputs `[{ label: "Refunds settled", value: "41" }]` · citation `CITATIONS.refundsApi` ·
onMerchantReport **true**

**L-03** · `tax_on_fees` · label `GST at 18% on the fee` · amount `-432000` ·
count `null` · unitAmount `null` · formula `18% × gateway fee` ·
inputs `[{ label: "Gateway fee", value: "₹24,000.00" }, { label: "GST rate", value: "18%" }]` ·
citation `CITATIONS.gst` · onMerchantReport **true**

**L-04** · `failed_payment_fee` · label `Failed-payment charges` · amount `-330000` ·
count **1100** · unitAmount **300** · formula `1,100 failed attempts × ₹3` ·
inputs `[{ label: "Failed authorisation attempts", value: "1,100" }, { label: "Charge per attempt", value: "₹3.00" }]` ·
citation `CITATIONS.failedFee` · onMerchantReport **false**

**L-05** · `chargeback_principal` · label `Chargebacks (principal)` · amount `-540000` ·
count **2** · unitAmount **270000** · formula `2 disputes × ₹2,700` ·
inputs `[{ label: "Disputes raised", value: "2" }]` · citation `CITATIONS.chargebackApi` ·
onMerchantReport **true**
(unitAmount is the per-dispute principal read off the disputes collection, not a policy figure)

**L-06** · `chargeback_fee` · label `Chargeback fees` · amount `-100000` ·
count **2** · unitAmount **50000** (`p.fixed("P-04")`) · formula `2 disputes × ₹500` ·
inputs `[{ label: "Disputes raised", value: "2" }]` · citation `CITATIONS.chargebackFee` ·
onMerchantReport **false**

**L-07** · `instant_settlement_fee` · label `On-demand settlement fee` · amount `-106200` ·
count `null` · unitAmount `null` ·
formula `settlement.fees + settlement.tax, read from the rail's response` ·
inputs `[{ label: "Amount settled on demand", value: "₹3,00,000.00" }, { label: "settlement.fees", value: "₹900.00" }, { label: "settlement.tax", value: "₹162.00" }]` ·
citation `CITATIONS.instantSettlementApi` · onMerchantReport **false**

**L-08** · `net_credited` · label `Actually credited` · amount **0** ·
count `null` · unitAmount `null` · formula `signed sum of every line above` ·
inputs `[{ label: "Lines", value: "8" }]` (= `String(drafts.length - 1)`) ·
citation `CITATIONS.derivedNet` · onMerchantReport **true**

`seal()` computes `runningBalance` for all nine, leaves L-08's `amount` at 0, sets L-08's
`runningBalance` to the sum, and throws `ReconcileError` if that sum ≠ `statedNetPaise`.

### The Explanation wrapper

`settlementId` `stl_2608mera01` · `cycleId` `cyc_202608` · `cycleLabel` `August 2026` ·
`periodStart` `Date.parse("2026-07-31T18:30:00.000Z")` ·
`periodEnd` `Date.parse("2026-08-31T18:29:59.999Z")` ·
`settledAt` `Date.parse("2026-09-03T05:30:00.000Z")` — **all six off the `RawCycle`** ·
`merchant` `{ id: "mer_meera01", name: "Meera", segment: "D2C skincare, ₹12L/month",
plan: { label: "Flat 2% — all instruments", headlineBps: 200, citation: CITATIONS.planFee },
constructed: true }` — off the cycle ·
`expectationBasis` `gross − 2% − refunds` (U+2212) ·
`reconciliation` `{ ok: true, computedNet: 112891800, statedNet: 112891800, delta: 0 }` ·
`policyId` `policy.id` (`pol_flat2pc01`)

---

## 5. Sole ownership

**You may create or edit only these six paths:**

- `apps/api/src/engine/policy-apply.ts`
- `apps/api/src/engine/calculate.ts`
- `apps/api/src/engine/instrument-mix.ts`
- `apps/api/test/calculator.test.ts`
- `tools/invariants/waterfall.ts`
- `docs/log/ws-calculator.md`

**Do not touch, another agent owns it:**

- `packages/contract/**` — frozen at v0.1.0. Not one character.
- `apps/api/src/domain/**` and `apps/api/src/store.ts` — WS-0. You consume only. A needed
  change is an escalation (section 2.6), never an edit.
- `apps/api/src/source/**` — WS-2. **You must never import the generator.** `MEERA_CYCLE` is
  your input. If your test imports anything from `src/source/`, you have coupled the rupee gate
  to a stream that may be cut at 18:45.
- `apps/api/src/engine/ceiling.ts` — WS-3. `window.ts`, `report.ts`, `forecast.ts` — WS-4.
- `apps/api/src/routes/**`, `index.ts`, `engine-computed.ts`, `engine-fixture.ts`,
  `config.ts`, `boot-selftest.ts`, `render.yaml` — WS-5. You export pure functions; they
  assemble. Do not wire yourself into a route.
- `tools/invariants/index.ts`, `ceiling.ts`, `report.ts`, `cross-cycle.ts` — WS-0 and WS-3.
- `apps/api/test/*.test.ts` other than `calculator.test.ts`.
- `docs/adr/**` and `docs/BUILD_LOG.md` — WS-8. The aggregation decision goes in your doc
  comment and your log; WS-8 lifts it into ADR-0007.
- `package.json`, `apps/api/package.json`, `pnpm-lock.yaml` — WS-0 owns tonight's single
  install. You need no new dependency; if you think you do, you are about to write arithmetic
  that belongs in `@assay/contract`.

---

## 6. `apps/api/test/calculator.test.ts` — the counter

Write this file **first**, with all 34 assertions present and failing, so the 18:00 read is real.

Inputs are `MEERA_CYCLE` and `COMMITTED_POLICY`. Fixture constants from `@assay/contract`
appear **only as expected values** — never as inputs, or the test proves nothing.

Implement a wrapper that counts rather than aborts, plus a gate that keeps `pnpm test` honest:

```ts
const TOTAL = 34;
let registered = 0, passed = 0;
function tier1(label: string, fn: () => void) {
  registered++;
  try { fn(); passed++; }
  catch (e) { console.log(`TIER-1 FAIL · ${label} · ${(e as Error).message}`); }
}
// ... 34 tier1(...) calls ...
after(() => console.log(`TIER-1 ${passed}/${TOTAL}`));
test("tier-1 gate", () => {
  assert.equal(registered, TOTAL, "assertion count drifted — do not delete a tier-1 check");
  assert.equal(passed, TOTAL);
});
```

`TIER-1 N/34` must appear on its own line in `pnpm test` output. The `registered` check exists so
the counter cannot be gamed by deleting an assertion.

**The 34, exactly:**

- **1–12** the twelve figures of §3.4, each `assert.equal(computed, F.<CONST>)`:
  `GROSS_CAPTURED`, `GATEWAY_FEE`, `REFUND_PRINCIPAL`, `GST_ON_FEES`, `FAILED_FEES`,
  `CHARGEBACK_PRINCIPAL`, `CHARGEBACK_FEES`, `INSTANT_SETTLEMENT_TOTAL`,
  `NET_CREDITED` (= `rupees(11_28_918)`), `MERCHANT_EXPECTED`, `UNEXPLAINED_GAP`
  (= `rupees(15_082)`), `TOTAL_DELTA` (= `rupees(71_082)`)
- **13–21** the nine line ids in kind order — one assertion per line asserting both `id` and
  `kind` at position *i*
- **22–27** `count` and `unitAmount` on L-04 (1100 / 300), L-05 (2 / 270000), L-06 (2 / 50000)
- **28–32** the five instrument slices, one assertion each, checking `instrument`,
  `grossCaptured` and `feeCharged` together against `F.INSTRUMENT_MIX[i]`
- **33** `reconciliation.delta === 0`
- **34** the perturbation: `calculate({ ...MEERA_CYCLE, statedNetPaise: MEERA_CYCLE.statedNetPaise + 1 }, COMMITTED_POLICY)`
  **throws `ReconcileError`** — `assert.throws(fn, ReconcileError)`. It must not return an
  `Explanation` carrying a delta of 1.

**Tier-2 tests in the same file, outside the counter** (they may fail at 18:45 without moving
the number, and must pass by 20:15):

- `checkWaterfall(calculate(MEERA_CYCLE, COMMITTED_POLICY))` returns `[]`
- `Explanation.parse(calculate(...))` succeeds against the frozen Zod schema
- an unapproved policy (`{ ...COMMITTED_POLICY, lines: [{ ...P01, approved: false }, ...rest] }`)
  throws `PolicyNotApprovedError`, and throws **before** any rupee is computed
- `INSTRUMENT_MIX` collapse flags: `card_credit` is `true`, `netbanking` is `false`
- Σ `slice.feeCharged` equals `bps(GROSS_CAPTURED, 200)` — asserted as a *fact*, never used as
  the definition of the gateway fee
- **the 20:15 target:** `assert.deepEqual(calculate(MEERA_CYCLE, COMMITTED_POLICY), F.EXPLANATION)`

**At 18:45 report the number and nothing else.** 34/34 = proceed. 28–33 = proceed, the backtest
replay gets cut. Under 28 = WS-2 is cut and the engine reads `MEERA_CYCLE` for the night. That
decision is not yours to make or to argue; report the integer.

---

## 7. Standing instruction — the log

Keep `docs/log/ws-calculator.md` open the whole session. **The moment something breaks or
surprises you, write two or three sentences, in the moment, before you fix it.** Append only;
never rewrite an earlier entry; never edit `docs/BUILD_LOG.md` (WS-8 concatenates yours into it).

Format: `### HH:MM — one-line title`, then what you expected, what happened, and the judgement
call you made.

Write only real engineering judgement: a rounding identity that held by luck and was made
structural; a fixture field that turned out to be derived from something you did not have; an
invariant you had to weaken and why that was correct. **Do not log dependency versions, install
noise, or "fixed a typo".** This feeds the application form's *"what broke, and how you got out"* —
which Razorpay reads first — so an entry that is not about a decision is worse than no entry.

The `collapsedInReport` trap and the `Σ bps(slice) vs bps(Σ)` decision are both worth entries if
you hit them, even though you were warned.

---

## 8. Acceptance criteria

1. `pnpm test` prints a line matching exactly `TIER-1 34/34` by 20:15, and by 18:45 prints
   `TIER-1 N/34` with N ≥ 28.
2. `node --test` (or `pnpm test`) exits 0 with the `tier-1 gate` test green — meaning
   `registered === 34` and `passed === 34`.
3. `assert.deepEqual(calculate(MEERA_CYCLE, COMMITTED_POLICY), F.EXPLANATION)` passes.
4. `Explanation.parse(calculate(MEERA_CYCLE, COMMITTED_POLICY))` succeeds against the frozen
   schema in `packages/contract/src/contract.ts`.
5. `checkWaterfall(calculate(MEERA_CYCLE, COMMITTED_POLICY))` returns `[]`, and W1–W5 are all
   implemented (not stubs).
6. `calculate` with `statedNetPaise + 1` throws `ReconcileError`; `calculate` with any
   `PolicyLine.approved !== true` throws `PolicyNotApprovedError`. Neither returns a payload.
7. `pnpm typecheck` is green across the workspace with zero occurrences of `as any` or
   `@ts-expect-error` in the six files you own:
   `grep -rn "as any\|@ts-expect-error" apps/api/src/engine tools/invariants/waterfall.ts` → no output.
8. No rate literal in the two policy-consuming files:
   `grep -nE "\b(200|1800|300|500|2700|50000|270000)\b" apps/api/src/engine/policy-apply.ts apps/api/src/engine/calculate.ts`
   → no output. (`instrument-mix.ts` is exempt for `networkMdrBps` only, and those values are
   never operands of arithmetic.)
9. No ambient state: `grep -rn "process\.env\|Date\.now\|new Date(\|Math\.random" apps/api/src/engine/`
   → no output. `calculate` called twice with the same inputs returns deeply equal values.
10. No import from `apps/api/src/source/**` anywhere in the six files you own:
    `grep -rn "src/source\|\.\./source" apps/api/src/engine apps/api/test/calculator.test.ts` → no output.
11. All arithmetic goes through `bps()` / `rupees()` from `@assay/contract`:
    `grep -nE "Math\.round|/ ?10_?000|\* ?100\b" apps/api/src/engine/*.ts` → no output.
12. Every citation in the output is reference-identical to a member of `CITATIONS` —
    `assert.ok(Object.values(CITATIONS).includes(line.citation))` holds for all nine lines and
    all five slices.
13. `git status --porcelain` shows changes only under the six owned paths. Nothing under
    `packages/contract/`, `apps/api/src/domain/`, `apps/api/src/routes/`, or `apps/api/src/source/`.
14. `apps/api/src/engine/policy-apply.ts` opens with the `AGGREGATION LEVEL` doc comment
    covering P-01 through P-05 and the `Σ bps ≠ bps Σ` hazard.
15. `docs/log/ws-calculator.md` has at least one substantive entry, or an explicit line saying
    nothing surprising happened.

---

## 9. Report back

One message, in this shape:

1. `TIER-1 N/34` at each of 18:00, 18:30, 18:45, and the final number.
2. Whether criterion 3 (`deepEqual` against `F.EXPLANATION`) passes, and if not, the exact
   field path and the two values that differ.
3. Every escalation you raised to WS-0's agent: the field added, its type, and the one-line
   announcement you made. Especially whether `onDemandBasePaise`, the `RawCycle` identity
   fields, and `RawCycle.merchant` existed or had to be added.
4. The exported signatures other streams will import, verbatim — WS-5 assembles
   `engine-computed.ts` from them and cannot wait for you to explain.
5. Anything you found that changes another stream's assumptions — particularly for WS-3
   (`instrumentMix` shape, `collapsedInReport` semantics) and WS-4 (whether `calculate` is
   reusable forward over a partial cycle for the forecast).
6. The two or three log entries, quoted, so they can go straight into the form.
