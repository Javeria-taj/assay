# WS-3 — Ceiling analyser and the cross-cycle adversarial harness

**Wave 1 · test written 17:00–17:45 (wave 0) · implementation 17:45–19:15 · harness 20:15–21:30 · ~90 min of code · NOT cuttable**

**Done means:** `assert.deepEqual(analyseCeiling(F.EXPLANATION), F.CEILING)` passes with
every number computed from the `Explanation`'s own line flags and instrument mix — no
figure in `apps/api/src/engine/ceiling.ts` is a rupee constant — and by 21:30
`apps/api/test/cross-cycle.test.ts` runs at least five cycles through the full engine with
**no authored expected output**, green on the ten `API_CONTRACT.md` invariants plus the two
ceiling identities.

This is the one stream in the night that distinguishes an engine from a lookup table. It is
deliberately not owned by the calculator's author or the generator's author.

---

## 1. Preconditions

**At 17:00 (wave 0) you need nothing but the frozen contract.** Start immediately:

- `packages/contract/src/contract.ts` — read `Ceiling`, `CeilingBucket`, `MissingField`,
  `InstrumentSlice`, `ExplanationLine`, `Share`, `PaiseSchema`.
- `packages/contract/src/fixtures.ts` — read `CEILING`, `EXPLANATION`, `INSTRUMENT_MIX`,
  `CITATIONS`, `EXPLANATION_LINES`.
- `packages/contract/src/money.ts` — `rupees`, `bps`, `share`, `formatPaise`.
- `packages/contract/src/reconcile.test.ts` — the three ceiling tests in it are your
  minimum bar; yours must be stricter.
- `API_CONTRACT.md` — the ten invariants, verbatim. You will restate them in code.

**At 17:45 you need WS-0's second commit.** Confirm these exist before writing
`ceiling.ts`'s body:

- `apps/api/src/domain/attribution.ts` — `MissingFieldId`, `attributionOf(slice)`,
  `isStatutoryZeroMdr(instrument)`
- `apps/api/src/domain/copy.ts` — `ceilingHeadline(amountPaise, share)`, `CEILING_METHOD`,
  `MISSING_FIELD_COPY`
- `apps/api/src/domain/README.md` — the amendment protocol

**At 20:15 you need**, for the harness only: WS-1's `apps/api/src/engine/calculate.ts`
(`calculate(cycle, policy)`), WS-0's `apps/api/src/domain/meera.ts` (`MEERA_CYCLE`) and
`committed-policy.ts` (`COMMITTED_POLICY`), and — if it survived the 18:45 gate — WS-2's
`apps/api/src/source/synthetic.ts`. Section 5 tells you what to do when it did not.

---

## 2. The brief

> You own the explainability ceiling. Your input is one contract-valid `Explanation`. Your
> output is one contract-valid `Ceiling`. You are a **pure, synchronous function**: no HTTP,
> no env, no clock, no randomness, no I/O, no memoisation. Another agent (WS-5) makes you
> async and caches you behind `Engine.ceiling()`. Do not import `apps/api/src/store.ts`.
>
> ### 2.1 The single export
>
> `apps/api/src/engine/ceiling.ts`:
>
> ```ts
> import type { Ceiling, Explanation } from "@assay/contract";
>
> export function analyseCeiling(e: Explanation): Ceiling;
> ```
>
> That is the whole public surface. Everything else in the file is module-private.
>
> **Create this file at 17:00**, in wave 0, as a stub that imports only types from
> `@assay/contract` and throws `new Error("WS-3: analyseCeiling not implemented")`. It must
> import nothing from `apps/api/src/domain/**` yet — that directory does not exist until
> 17:45, and a broken import would red the workspace typecheck for three other agents. The
> stub exists so `apps/api/test/ceiling.test.ts` compiles and *fails honestly* from minute
> one. Your gate exists before your code does; that is the point of the wave-0 slot.
>
> ### 2.2 The bucketable set — decide this before any arithmetic
>
> Put a doc comment at the top of the file headed
> `BUCKETING — decided 17:45, do not relitigate`, stating:
>
> - **`totalDelta = e.grossCaptured − e.netCredited`.** Never a sum of your own.
> - The **bucketable lines** are every line whose `kind` is neither `"gross_captured"` nor
>   `"net_credited"`. The two markers are the endpoints of the delta, not components of it.
> - Each bucketable line contributes **`−line.amount`** to its bucket — a *negation*, not
>   `Math.abs()`. Deductions are negative in the contract, so negation makes them positive
>   contributions; a positive `adjustment` line correctly contributes a negative amount and
>   shrinks its bucket. `Math.abs()` would silently break the identity below the moment a
>   cycle carries a positive adjustment, and the generator is allowed to emit one.
> - Because invariant 1 holds (signed lines sum to `netCredited`), `Σ(−amount)` over the
>   bucketable set is **identically** `grossCaptured − netCredited`. The four buckets
>   therefore sum to `totalDelta` on both axes structurally, not by luck. Write that
>   sentence down.
>
> Then assert it. At the end of `analyseCeiling`, throw a plain `Error` (this is a
> programming mistake, not a `reconciliation_failed`) if any of these fails, with a message
> naming the offending number:
>
> - `amountReconciled.amount + amountUnreconciled.amount !== totalDelta`
> - `basisVerifiable.amount + basisUnverifiable.amount !== totalDelta`
> - `totalDelta < 0`
> - any bucket amount outside `[0, totalDelta]` — a negative bucket would produce a `share`
>   outside `Share`'s `0..1` and fail the frozen schema at the route boundary
>
> ### 2.3 The two axes
>
> ```
> amountUnreconciled.amount = Σ(−amount) over bucketable lines where amountReconciled === false
> amountReconciled.amount   = totalDelta − amountUnreconciled.amount
> basisUnverifiable.amount  = Σ(−amount) over bucketable lines where basisVerifiable === false
> basisVerifiable.amount    = totalDelta − basisUnverifiable.amount
> ```
>
> Sum the *false* side and take the complement for the *true* side, on both axes. It costs
> nothing and removes a class of drift.
>
> **These two axes are independent and must never be collapsed.** For Meera: 100%
> reconciled, 66.24% basis-verifiable. A line can reconcile perfectly and be entirely
> uncheckable — the ₹24,000 gateway fee is exactly that, and it is the product's finding.
>
> ### 2.4 TRAP ONE — shares. Compute one, derive the other.
>
> ```ts
> const round4 = (x: number): number => Math.round(x * 10_000) / 10_000;
> ```
>
> Local to this file. `packages/contract/src/money.ts` is frozen — do not add to it.
>
> ```ts
> basisUnverifiable.share  = share(basisUnverifiable.amount, totalDelta);   // from @assay/contract
> basisVerifiable.share    = round4(1 - basisUnverifiable.share);
> amountUnreconciled.share = share(amountUnreconciled.amount, totalDelta);
> amountReconciled.share   = round4(1 - amountUnreconciled.share);
> ```
>
> **Two independent `share()` calls do not reliably sum to 1.0000.** `share()` rounds half
> away from zero, so a split landing on a 4dp `.00005` boundary rounds *both* halves up and
> the pair sums to 1.0001, failing invariant 7 and the frozen `Share` bound. Meera's numbers
> dodge it (0.3376 + 0.6624 = 1.0000 exactly). Generated cycles will not. Derive the
> complement and the failure mode cannot occur.
>
> Deriving the complement is `deepEqual`-compatible with the fixture:
> `round4(1 − 0.3376) === 0.6624 === share(4_708_200, 7_108_200)`, and
> `round4(1 − 0) === 1 === F.CEILING.amountReconciled.share`. You lose nothing.
>
> A `totalDelta` of 0 needs no special case: `share()` guards divide-by-zero and returns 0,
> so the unverifiable share is 0, the verifiable share is 1, both amounts are 0, and
> invariant 7 still holds.
>
> ### 2.5 TRAP TWO — the zero-MDR filter is statutory, not numeric.
>
> ```
> zeroMdrExposure.grossOnZeroMdrRails     = Σ slice.grossCaptured where isStatutoryZeroMdr(slice.instrument)
> zeroMdrExposure.feeLeviedOnZeroMdrRails = Σ slice.feeCharged    where isStatutoryZeroMdr(slice.instrument)
> zeroMdrExposure.annualisedFee           = feeLeviedOnZeroMdrRails * 12
> ```
>
> Filter on **`isStatutoryZeroMdr(slice.instrument)`** from `domain/attribution.ts`. Never on
> `slice.networkMdrBps === 0`. Netbanking carries `networkMdrBps: 0` in the fixture mix and
> is **not** statutory zero-MDR: it is a flat per-transaction bank charge, not an ad-valorem
> MDR, and `F.CEILING.zeroMdrExposure.note` says so in its own last sentence. A naive numeric
> filter returns ₹15,600 instead of ₹14,400 and fails the fixture. Assert the wrong number is
> *not* produced — assertion 24.
>
> `citations` is `[F.CITATIONS.zeroMdrStatute, F.CITATIONS.s269su]`, in that order.
>
> **The note is rendered from a template, not pasted.** Four substitutions, so it stays true
> for a generated cycle:
>
> ```
> `${formatPaise(gross, { paise: false })} of this cycle moved on a rail that carries zero
> network MDR by statute — UPI from a bank account. Under a flat ${pct} plan that slice still
> attracted ${formatPaise(fee, { paise: false })} of fee. This is legal, disclosed in the
> plan, and invisible on the report: nothing ${e.merchant.name} is given tells her the slice
> exists. Counted here only for rails where zero MDR is mandated by statute (UPI from a bank
> account, RuPay debit) — netbanking is excluded, as it carries a flat per-transaction bank
> charge rather than an ad-valorem MDR.`
> ```
>
> One line, no newlines — the fixture's note is a single string; the wrapping above is this
> document's, not the file's. `pct` is `e.merchant.plan.headlineBps / 100` rendered with
> trailing zeros dropped, then `"%"`: 200 → `"2%"`, 250 → `"2.5%"`. All three em dashes are
> U+2014 with a space either side. `formatPaise(72_000_000, { paise: false })` gives
> `₹7,20,000` and `formatPaise(1_440_000, { paise: false })` gives `₹14,400` — the Indian
> grouping is already correct, do not reimplement it.
>
> Assertion 25 compares the rendered string to `F.CEILING.zeroMdrExposure.note` byte for
> byte. If it fails, print both and diff them character by character — do not eyeball a
> 500-character sentence at 19:00.
>
> ### 2.6 `missingFields` — a partition, not three assertions
>
> Group `e.instrumentMix` by `attributionOf(slice)` and sum `feeCharged` per group. For
> Meera that is:
>
> | slice | `reportedAs` | `attributionOf` | `feeCharged` |
> |---|---|---|---:|
> | `upi_bank_account` | `UPI` | `instrument_subtype` | ₹14,400 |
> | `upi_rupay_credit` | `UPI` | `instrument_subtype` | ₹2,400 |
> | `upi_ppi` | `UPI` | `instrument_subtype` | ₹1,200 |
> | `card_credit` | `Card` | `card_bin_tier` | ₹4,800 |
> | `netbanking` | `Netbanking` | `per_line_fee_basis` | ₹1,200 |
>
> → `instrument_subtype: ₹18,000`, `card_bin_tier: ₹4,800`, `per_line_fee_basis: ₹1,200`.
>
> They are non-overlapping **by partition** — every slice lands in exactly one group — not by
> three hardcoded numbers that happen to add up. They sum to ₹24,000 because
> `Σ slice.feeCharged` *is* the gateway fee (invariant 4, and WS-1 defines the gateway fee as
> that sum). That is the "computed, never hardcoded" requirement discharged exactly, and it
> is the sentence to put in the file's doc comment.
>
> **Closing invariant 8 structurally.** The slice partition covers the gateway-fee line only.
> If some *other* bucketable line is flagged `basisVerifiable: false` — WS-1 flags only the
> gateway fee today, but a generated cycle or a future policy line could add one — the sums
> would diverge and invariant 8 would fail. So:
>
> 1. `unverifiableFromGatewayFee` = `Σ(−amount)` over bucketable lines with
>    `basisVerifiable === false` **and** `kind === "gateway_fee"`.
> 2. `unverifiableOther` = `basisUnverifiable.amount − unverifiableFromGatewayFee`.
> 3. Distribute `unverifiableFromGatewayFee` across the three ids **pro rata by the slice
>    partition**. For Meera the slice fees already sum to exactly that amount, so each group
>    takes its own sum unchanged and no rounding occurs. Apply any pro-rata residual to
>    `per_line_fee_basis` so the total is exact.
> 4. Add `unverifiableOther` to `per_line_fee_basis` — a line whose basis she cannot check
>    *is* a missing per-line fee basis, which is precisely what that field means.
>
> Now `Σ wouldResolve === basisUnverifiable.amount` holds by construction, on every cycle,
> forever. For Meera, `unverifiableOther` is 0 and step 3 is the identity, so the fixture is
> untouched. Do **not** assert `unverifiableOther === 0` — it is legitimately non-zero on
> other cycles.
>
> **Emission order is fixed and is not sorted:**
>
> ```ts
> const MISSING_FIELD_ORDER = ["instrument_subtype", "card_bin_tier", "per_line_fee_basis"] as const;
> ```
>
> `F.CEILING.missingFields` is in that order and `assert.deepEqual` on an array is
> order-sensitive. The `.sort()` in `reconcile.test.ts` is a separate, weaker assertion; both
> must pass.
>
> Emit a field **only when its `wouldResolve > 0`**, so a cycle with no card volume does not
> render an empty "Card BIN tier" row in Javeria's panel. If that leaves the array empty (a
> cycle with no gateway fee at all), emit the `per_line_fee_basis` entry with
> `wouldResolve: 0`, because the frozen schema is `z.array(MissingField).min(1)`. Comment
> why. For Meera all three are positive and the fixture is unaffected.
>
> `name` and `whyItMatters` come from `MISSING_FIELD_COPY[id]` in `domain/copy.ts`. `citation`
> is keyed on the id: `instrument_subtype` → `F.CITATIONS.upiCollapse`, `card_bin_tier` →
> `F.CITATIONS.binTier`, `per_line_fee_basis` → `F.CITATIONS.feeBasis`. Import `CITATIONS`
> from `@assay/contract`; do not retype a citation object.
>
> ### 2.7 Headline, method, id
>
> ```
> headline     = ceilingHeadline(basisUnverifiable.amount, basisUnverifiable.share)   // domain/copy.ts
> method       = CEILING_METHOD                                                       // domain/copy.ts
> settlementId = e.settlementId
> ```
>
> Do not retype either string. `ceilingHeadline(2_400_000, 0.3376)` returns
> `Every rupee reconciles. ₹24,000 of it — 33.8% — you have no way to check.` If it does not,
> that is WS-0's bug — escalate, do not patch it locally.
>
> **Tone.** Nothing you emit accuses anyone. The gateway fee is *correct and uncheckable*,
> not *missing* or *hidden*. Every string you produce is either imported from `copy.ts` or
> rendered from the fixture's own prose. If you find yourself writing a new sentence about
> fees, stop — the copy deck already exists, in `fixtures.ts` and `docs/assay_context.md`
> §7.4 and §9.
>
> ### 2.8 Escalation
>
> If `attributionOf` or `isStatutoryZeroMdr` returns something that breaks the fixture, that
> is a **tier-2 escalation to WS-0's agent** — not a local edit, and not a private copy of
> the logic inside `ceiling.ts`. Say in one line which input produced which wrong output and
> what you expected. `as any` and `@ts-expect-error` are grepped for and banned in
> `apps/api/src` — reaching for either is the signal to escalate, not to proceed.

---

## 3. Every number you need

Paise, with the rupee figure alongside. Never type a rupee literal into `ceiling.ts` — these
are here so you recognise a wrong answer instantly, and they belong in the **test** as
expected values only.

| quantity | paise | rupees |
|---|---:|---:|
| `grossCaptured` | 120000000 | ₹12,00,000 |
| `netCredited` | 112891800 | ₹11,28,918 |
| `totalDelta` | 7108200 | ₹71,082 |
| `amountReconciled.amount` | 7108200 | ₹71,082 |
| `amountUnreconciled.amount` | 0 | ₹0 |
| `basisVerifiable.amount` | 4708200 | ₹47,082 |
| `basisUnverifiable.amount` | 2400000 | ₹24,000 |
| `missingFields[0]` `instrument_subtype` | 1800000 | ₹18,000 |
| `missingFields[1]` `card_bin_tier` | 480000 | ₹4,800 |
| `missingFields[2]` `per_line_fee_basis` | 120000 | ₹1,200 |
| `grossOnZeroMdrRails` | 72000000 | ₹7,20,000 |
| `feeLeviedOnZeroMdrRails` | 1440000 | ₹14,400 |
| `annualisedFee` | 17280000 | ₹1,72,800 |
| the WRONG zero-MDR answer (numeric filter) | 1560000 | ₹15,600 |

Shares: `amountReconciled.share = 1`, `amountUnreconciled.share = 0`,
`basisVerifiable.share = 0.6624`, `basisUnverifiable.share = 0.3376`.

The bucketable lines and their contributions (`−amount`), summing to the ₹71,082:

| line | kind | −amount (paise) | `amountReconciled` | `basisVerifiable` |
|---|---|---:|---|---|
| L-01 | `gateway_fee` | 2400000 | true | **false** |
| L-02 | `refund_principal` | 3200000 | true | true |
| L-03 | `tax_on_fees` | 432000 | true | true |
| L-04 | `failed_payment_fee` | 330000 | true | true |
| L-05 | `chargeback_principal` | 540000 | true | true |
| L-06 | `chargeback_fee` | 100000 | true | true |
| L-07 | `instant_settlement_fee` | 106200 | true | true |
| | **sum** | **7108200** | | |

L-00 (`gross_captured`, +120000000) and L-08 (`net_credited`, amount 0) are excluded.

Instrument mix, gross / fee per slice in paise: `upi_bank_account` 72000000 / 1440000 ·
`upi_rupay_credit` 12000000 / 240000 · `upi_ppi` 6000000 / 120000 · `card_credit` 24000000 /
480000 · `netbanking` 6000000 / 120000. Gross sums to 120000000, fees to 2400000.

`SETTLEMENT_ID = "stl_2608mera01"`. Merchant plan `headlineBps = 200`, merchant name `Meera`.

---

## 4. `apps/api/test/ceiling.test.ts` — the 19:15 proof

Write this **first, in wave 0**, with all 32 assertions present and failing against the stub.
Print a counter so the 19:15 read is a number, not an opinion:

```
CEILING 32/32
```

Same shape as WS-1's Tier-1 counter: a wrapper that records pass/fail per named assertion
rather than aborting on the first failure, prints `CEILING N/32`, and then fails the test run
if `N < 32` so `pnpm test` stays honest. Assertions 1–29 exist to give a *gradient* — 31
subsumes them, but `CEILING 27/32` at 18:30 tells you where you are and "deepEqual failed"
does not.

**Input is `F.EXPLANATION`. Fixture constants appear only as expected values.** If you ever
pass a `F.CEILING` field *into* `analyseCeiling`, the test proves nothing.

1. `totalDelta === 7108200`
2. `amountReconciled.amount === 7108200`
3. `amountReconciled.share === 1`
4. `amountUnreconciled.amount === 0`
5. `amountUnreconciled.share === 0`
6. `basisVerifiable.amount === 4708200`
7. `basisVerifiable.share === 0.6624`
8. `basisUnverifiable.amount === rupees(24_000)`
9. `basisUnverifiable.share === 0.3376`
10. `basisVerifiable.amount + basisUnverifiable.amount === totalDelta`
11. `amountReconciled.amount + amountUnreconciled.amount === totalDelta`
12. `Math.round((basisVerifiable.share + basisUnverifiable.share) * 10_000) === 10_000`
13. `missingFields.length === 3`
14. emission order is `["instrument_subtype", "card_bin_tier", "per_line_fee_basis"]`
15. `missingFields.map(m => m.id).sort()` is `["card_bin_tier", "instrument_subtype", "per_line_fee_basis"]`
16. `instrument_subtype.wouldResolve === rupees(18_000)`
17. `card_bin_tier.wouldResolve === rupees(4_800)`
18. `per_line_fee_basis.wouldResolve === rupees(1_200)`
19. `Σ wouldResolve === basisUnverifiable.amount`
20. every `missingFields[].citation.sourceId` is non-empty, and each citation `deepEqual`s
    the matching `F.CITATIONS` object
21. `zeroMdrExposure.grossOnZeroMdrRails === rupees(7_20_000)`
22. `zeroMdrExposure.feeLeviedOnZeroMdrRails === rupees(14_400)`
23. `zeroMdrExposure.annualisedFee === rupees(1_72_800)`
24. `zeroMdrExposure.feeLeviedOnZeroMdrRails !== rupees(15_600)`, with the assertion message
    *"netbanking carries networkMdrBps 0 and is not statutory zero-MDR"* — the numeric-filter trap
25. `zeroMdrExposure.note === F.CEILING.zeroMdrExposure.note` — template rendered, byte-identical
26. `deepEqual(zeroMdrExposure.citations, [F.CITATIONS.zeroMdrStatute, F.CITATIONS.s269su])`
27. `headline === F.CEILING.headline`
28. `method === F.CEILING.method`
29. `settlementId === F.SETTLEMENT_ID`
30. `Ceiling.parse(analyseCeiling(F.EXPLANATION))` does not throw
31. `assert.deepEqual(analyseCeiling(F.EXPLANATION), F.CEILING)`
32. **the tie test.** Build a synthetic `Explanation` in the test file by shallow-copying
    `F.EXPLANATION` and replacing `lines` with a hand-made waterfall whose unverifiable half
    is *exactly* half the delta, then assert
    `Math.round((bv.share + bu.share) * 10_000) === 10_000` **and** `bv.share + bu.share <= 1`.
    This is the proof that the complement is derived rather than computed twice. Keep it
    small — two deduction lines plus the two markers is enough — and do not run it through
    `seal()`; you are constructing an input, not a settlement.

---

## 5. `apps/api/test/cross-cycle.test.ts` — the adversarial harness (20:15 → 21:30)

**No authored expected output anywhere in this file.** Not one rupee figure. The moment you
type an expected number here you have written a second fixture and the harness proves
nothing. It gates only on *identities that must hold for any cycle*.

For each cycle: `const e = calculate(cycle, COMMITTED_POLICY); const c = analyseCeiling(e);`
then assert, with the cycle id in every failure message:

1. `Σ e.lines.filter(l => l.kind !== "net_credited").amount === e.netCredited`
2. `e.reconciliation.delta === 0` and `e.reconciliation.ok === true`
3. `e.merchantExpected − e.netCredited === e.unexplainedGap`
4. `Σ instrumentMix.grossCaptured === e.grossCaptured`, and `Σ instrumentMix.feeCharged ===
   −(the gateway_fee line's amount)`
5. every line has `citation.sourceId.length > 0`
6. every line with `basisVerifiable === false` has a non-null, non-empty `unverifiableReason`;
   every line with `basisVerifiable === true` has `unverifiableReason === null`
7. `c.amountReconciled.amount + c.amountUnreconciled.amount === c.totalDelta` and
   `c.basisVerifiable.amount + c.basisUnverifiable.amount === c.totalDelta`;
   both share pairs round to `10_000` at 4dp
8. `Σ c.missingFields[].wouldResolve === c.basisUnverifiable.amount`
9. every line of `COMMITTED_POLICY` is `parsedBy: "model"` and `approved: true` with a
   non-empty `approvedBy` and a positive `approvedAt` — asserted once, not per cycle
10. `Forecast.backtest.cycles === 0` — asserted once against WS-4's forecast builder if it is
    importable as a pure function. If the forecast exists only behind the engine, skip it
    here and note in a comment that `tools/invariants/` covers it over the wire. Do not
    import a route to reach it.

Plus, contract-level: `Explanation.parse(e)` and `Ceiling.parse(c)` succeed for every cycle.
Zod is an invariant you get for free — use it.

Plus, ceiling-specific and not in `API_CONTRACT.md`: `c.totalDelta === e.grossCaptured −
e.netCredited`; every bucket amount lies in `[0, c.totalDelta]`; `c.missingFields.length >= 1`;
`c.zeroMdrExposure.annualisedFee === c.zeroMdrExposure.feeLeviedOnZeroMdrRails * 12`;
`c.zeroMdrExposure.feeLeviedOnZeroMdrRails <= c.zeroMdrExposure.grossOnZeroMdrRails`.

### Where the cycles come from

Preferred: WS-2's generator, imported dynamically and guarded at runtime so this file
compiles and passes whether or not WS-2 shipped.

```ts
const mod = await import("../src/source/synthetic.js");
const gen = (mod as Record<string, unknown>).generateCycles;
const cycles: RawCycle[] =
  typeof gen === "function"
    ? (gen as (seeds: readonly string[]) => RawCycle[])(SEEDS)
    : fallbackCycles();
```

`SEEDS` is at least five fixed strings committed in this file, so the run is reproducible.
Print which path was taken: `CROSS-CYCLE source=synthetic cycles=5` or
`CROSS-CYCLE source=fallback cycles=3`. The same agent writes WS-2 later — pick the export
name here at 20:15 and use the same one there; if WS-2 has already shipped under a different
name, adapt **this** side, never that one.

**Fallback, if WS-2 was cut at the 18:45 gate:** `MEERA_CYCLE` plus two hand-perturbed
variants built in this file — one with every `card_*` payment removed (which drives
`card_bin_tier.wouldResolve` to 0 and exercises the omit-empty-field rule), one with the
`netbanking` payments doubled in count and amount. Both are plain `RawCycle` objects, so
nothing downstream notices which path ran. Keep the fallback even after WS-2 lands: it costs
nothing and it is the harness's own proof that it does not depend on the generator.

**The perturbed variants need a `statedNetPaise`, and you must not take it from
`calculate()`.** If you do, `reconciliation.delta === 0` becomes a tautology and assertion 2
is worthless. Write `independentNet(cycle: RawCycle): Paise` in this test file, implemented
**from the policy prose**, not by importing `policy-apply.ts` or `calculate.ts`:

```
gross       = Σ payments.amountPaise
sliceFee    = for each instrument present: bps(Σ that instrument's gross, 200)
gatewayFee  = Σ sliceFee                        // per-slice, matching P-01's aggregation level
gst         = bps(gatewayFee, 1800)             // on the cycle aggregate, matching P-02
refunds     = Σ refunds.amountPaise
failed      = failedAttempts.length * rupees(3)
cbPrincipal = Σ disputes.amountPaise
cbFees      = disputes.length * rupees(500)
onDemand    = settlement.feesPaise + settlement.taxPaise
net         = gross − gatewayFee − refunds − gst − failed − cbPrincipal − cbFees − onDemand
```

Two independent implementations agreeing to the paise is what makes `delta === 0` an
assertion instead of a restatement. It mirrors P-01's per-slice and P-02's cycle-aggregate
levels deliberately — flatten either and you get a rounding divergence, and that divergence
is a **finding worth a log entry**, not a number to fudge. If `independentNet` disagrees with
`calculate()` on a variant, do not "fix" the test until you know which side is wrong;
escalate to WS-1 with both numbers.

---

## 6. `tools/invariants/ceiling.ts` and `tools/invariants/cross-cycle.ts`

WS-0 leaves both as no-op stubs exporting one `InvariantCheck` each. You fill them. They run
over the **wire**, against the deployed Render URL, via `pnpm verify`.

```ts
export interface InvariantContext {
  base: string;
  token: string;
  settlementId: string;
  fetchJson(path: string): Promise<any>;
}
export interface InvariantCheck { name: string; run(ctx: InvariantContext): Promise<string[]>; }
```

`run` returns `[]` for pass, or an array of human-readable problem strings. Never throw;
never call `process.exit`; never print — `tools/verify-contract.ts` owns the table.

**`ceiling.ts`** — fetch `/v1/settlements/${ctx.settlementId}/ceiling` and
`/v1/settlements/${ctx.settlementId}/explanation`, then check exactly what a wrong deploy
would break: `totalDelta === gross − net`; both axes sum to `totalDelta`; both share pairs
round to 1.0000; `Σ missingFields[].wouldResolve === basisUnverifiable.amount`; every missing
field has a non-empty `citation.sourceId`; `annualisedFee === feeLeviedOnZeroMdrRails * 12`;
`feeLevied <= grossOnZeroMdrRails`; and `basisUnverifiable.amount === Σ(−amount)` over
explanation lines with `basisVerifiable === false`. That last cross-check is the one that
catches a ceiling served from a stale cache.

**`cross-cycle.ts`** — page `/v1/settlements` to the end via `nextCursor` and run the same
ceiling checks for **every** settlement id returned, not just `ctx.settlementId`. Cap at 10
settlements so `pnpm verify` stays under a few seconds. Problem strings name the settlement
id. If the list has exactly one item, say so in the returned output rather than passing
silently — a harness that quietly tested nothing is worse than one that fails.

**Do not edit `tools/verify-contract.ts`.** WS-5 owns it after WS-0's split, and your two
files are already registered in the `checks` array.

---

## 7. Sole ownership

**You create or edit only these:**

- `apps/api/src/engine/ceiling.ts`
- `apps/api/test/ceiling.test.ts`
- `apps/api/test/cross-cycle.test.ts`
- `tools/invariants/ceiling.ts`
- `tools/invariants/cross-cycle.ts`
- `docs/log/ws-ceiling.md`

**Do not touch — another agent owns it:**

- `packages/contract/**` — frozen at v0.1.0. Not one character. If your only way forward is a
  contract edit, the answer is no; escalate.
- `apps/api/src/domain/attribution.ts` — WS-0. You **consume** `attributionOf` and
  `isStatutoryZeroMdr`. If either is wrong, that is a tier-2 escalation to WS-0's agent, not
  a local edit and not a private reimplementation.
- the rest of `apps/api/src/domain/**` and `apps/api/src/store.ts` — WS-0.
- `apps/api/src/engine/calculate.ts`, `policy-apply.ts`, `instrument-mix.ts` — WS-1. You
  import `calculate` in the harness and nothing else from that stream.
- `apps/api/src/engine/window.ts`, `report.ts`, `forecast.ts`, `apps/api/src/demo-clock.ts` — WS-4.
- `apps/api/src/source/**` — WS-2. Dynamic, guarded import in the harness only.
- `apps/api/src/routes/**`, `index.ts`, `engine-fixture.ts`, `engine-computed.ts`,
  `config.ts`, `boot-selftest.ts`, `render.yaml`, `.github/workflows/**` — WS-5. You export a
  pure function; WS-5 wires it. Do not add a route.
- `tools/verify-contract.ts`, `tools/invariants/index.ts`, `tools/invariants/waterfall.ts`,
  `tools/invariants/report.ts` — WS-5, WS-0, WS-1 and WS-4 respectively.
- `apps/api/test/*.test.ts` other than `ceiling.test.ts` and `cross-cycle.test.ts`.
- `README.md`, `docs/adr/**`, `docs/BUILD_LOG.md`, `docs/SUBMISSION.md` — WS-8.
- `package.json`, `apps/api/package.json`, `pnpm-lock.yaml` — WS-0 owns tonight's single
  install. You need no new dependency; if you think you do, you are about to write arithmetic
  that already exists in `@assay/contract`.
- `apps/web/**` — Javeria's. Under no circumstances.

---

## 8. Standing instruction — the log

Append to **`docs/log/ws-ceiling.md`** the moment something breaks or surprises you, in the
moment, two or three sentences. Never at the end from memory; never rewrite an earlier entry.
Do not edit `docs/BUILD_LOG.md` — WS-8 concatenates your log into it from 20:00, so anything
you write still lands as long as it is in your own file.

Format: `### HH:MM — one-line title`, then what you expected, what actually happened, and the
judgement call you made.

Write only real engineering judgement: an identity that held by luck and was made structural;
a rounding rule that changed an answer by a paisa and why the paisa mattered; an invariant
you had to weaken and why weakening it was correct; a fixture number that turned out to be
derivable two ways that disagree. **Do not log dependency versions, install noise, or "fixed
a typo".** This feeds the application form's *"what broke, and how you got out"*, which
Razorpay reads before it reads the code — an entry that is not about a decision is worse than
no entry at all.

Three things on this stream are worth an entry even though you were warned about them: the
two-`share()`-calls tie, the `networkMdrBps === 0` filter returning ₹15,600, and the first
time `independentNet` disagreed with `calculate()`.

---

## 9. Acceptance criteria

1. `apps/api/src/engine/ceiling.ts` exists as a throwing stub by **17:15**, imports only
   types from `@assay/contract`, and `pnpm typecheck` is green with it in the tree.
2. `apps/api/test/ceiling.test.ts` exists by **17:45** with all 32 named assertions present,
   and prints `CEILING N/32` on every run.
3. By **19:15**, `pnpm test` prints exactly `CEILING 32/32`.
4. `assert.deepEqual(analyseCeiling(F.EXPLANATION), F.CEILING)` passes — the whole object,
   including `missingFields` in emission order and the byte-identical `zeroMdrExposure.note`.
5. `basisUnverifiable.amount === 2400000` and `basisUnverifiable.share === 0.3376`;
   `basisVerifiable.amount === 4708200` and `basisVerifiable.share === 0.6624`;
   `amountReconciled.share === 1` and `amountUnreconciled.amount === 0`.
6. `missingFields` emits `instrument_subtype` / `card_bin_tier` / `per_line_fee_basis` with
   `wouldResolve` `1800000` / `480000` / `120000`, summing to `2400000`.
7. `zeroMdrExposure` is `72000000` gross, `1440000` fee, `17280000` annualised, citing
   `PSSA-10A` then `IT-269SU`.
8. `grep -nE "rupees\(|24_000|14_400|18_000|4_800|1_200|15_600|0\.3376|0\.6624|7108200|4708200|2400000" apps/api/src/engine/ceiling.ts`
   returns **nothing**. Every rupee and every share is computed. Rupee constants live in the
   test as expected values only.
9. `grep -n "networkMdrBps" apps/api/src/engine/ceiling.ts` returns nothing —
   `isStatutoryZeroMdr` is the only zero-MDR filter in the file.
10. `grep -nE "as any|@ts-expect-error" apps/api/src/engine/ceiling.ts apps/api/test/ceiling.test.ts apps/api/test/cross-cycle.test.ts`
    returns nothing.
11. `apps/api/test/cross-cycle.test.ts` is green by **21:30** over at least five generated
    cycles, or — if WS-2 was cut — over `MEERA_CYCLE` plus two hand-perturbed variants, and
    prints `CROSS-CYCLE source=<synthetic|fallback> cycles=N`.
12. No authored expected rupee figure exists in `cross-cycle.test.ts`. The only numeric
    literals permitted are the seed strings and the `200` / `1800` / `3` / `500` / `12`
    inside `independentNet` — those are rules, not answers.
13. `tools/invariants/ceiling.ts` and `tools/invariants/cross-cycle.ts` each export one
    `InvariantCheck` that returns `[]` against the deployed URL, **and** returns a non-empty
    array when pointed at a deliberately broken payload. Prove the second half once by hand,
    with a local edit you then revert — a check that has never failed has never been tested.
14. `BASE=<render-url> pnpm verify` is green with both checks live, and the printed table
    still ends in the same `N/N passed` line shape as before your commit.
15. `pnpm test && pnpm typecheck` green from a clean workspace at the 22:45 freeze.
16. `docs/log/ws-ceiling.md` has at least two entries, both about decisions.

---

## 10. Report back

When the 19:15 proof lands, one message:

- `CEILING N/32` and the time.
- The four bucket amounts and the four shares exactly as your code produced them.
- Whether `deepEqual` against `F.CEILING` passes; if not, the exact first differing path.
- Anything `attributionOf` or `isStatutoryZeroMdr` did that you did not expect — flagged to
  WS-0's agent, not fixed locally.

When the harness lands at 21:30, one more:

- `CROSS-CYCLE source=<synthetic|fallback> cycles=N`, and which of the ten invariants, if
  any, a generated cycle broke before you understood why.
- Whether `independentNet` ever disagreed with `calculate()`, by how many paise, and which
  side was right.
- One line for WS-8: the sentence you would put in the README about what the harness proves.
