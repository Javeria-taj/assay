# WS-2 — Synthetic cycle generator

**Workstream id:** `ws-generator`
**Wave:** 1 (agent C, starts at the 18:45 gate, after WS-3 ceiling)
**Time box:** 90 minutes. Hard stop 20:15 for the core; the Wave-2 stretch runs to 21:30 and is abandoned there.
**Cuttable at the freeze:** yes. If this stream never lands, the engine reads `MEERA_CYCLE` forever and nothing downstream notices, because `RawCycle` is the same object either way.

**Done means:** `generate("meera-2026-08")` returns a `RawCycle` whose aggregate facts equal `MEERA_CYCLE`'s to the paise, and `calculate(generate("meera-2026-08"), COMMITTED_POLICY)` deep-equals `calculate(MEERA_CYCLE, COMMITTED_POLICY)`. Five further seeds produce genuinely different, self-consistent cycles that pass every structural invariant with no authored expected output.

---

## 1. Preconditions

Do not start until all of these are true. Check them, do not assume them.

1. WS-0 commit 2 is on `main`. Specifically these must exist and typecheck:
   - `apps/api/src/domain/raw.ts` — `RawCycle`, `RawMerchant`, `RawPayment`, `RawRefund`, `RawDispute`, `RawFailedAttempt`, `RawSettlementFacts`
   - `apps/api/src/domain/partition.ts` — `partition(target: Paise, n: number, rng?: () => number): Paise[]`
   - `apps/api/src/domain/ids.ts` — `mintSettlementId`, `mintCycleId`
   - `apps/api/src/domain/meera.ts` — `MEERA_CYCLE`
   - `apps/api/src/domain/committed-policy.ts` — `COMMITTED_POLICY`
   - `apps/api/src/domain/source.ts` — `SettlementSource`, `SourceName`, and whatever `CycleRef` Batch 2 defined
2. `pnpm test` and `pnpm typecheck` are green on a fresh `git pull --rebase`.
3. `git config core.hooksPath tools/githooks` has been run in your clone (WS-0 added the pre-push hook). If it has not, run `pnpm hooks` once.
4. The night's dependency install is already done by WS-0. **You install nothing.** No new dependency enters this workstream — the RNG is 12 lines of arithmetic.
5. `apps/api/src/source/synthetic.ts` (or wherever Batch 2 left the stub that throws `"synthetic source lands in Batch 3"`) exists. If Batch 2 put it at `apps/api/src/sources/synthetic.ts` — plural — move it to the singular path this brief names, in your first commit, and say so in one line in chat.

For the calculator round-trip (acceptance 6 and 7) you additionally need `apps/api/src/engine/calculate.ts` exporting `calculate(cycle: RawCycle, policy: Policy): Explanation` on `main`. That is WS-1's, due 20:15. Write everything else first; rebase and add the round-trip test last. **Do not push a red test.**

---

## 2. The brief — paste this to the agent

> You are implementing the synthetic cycle generator for Assay. You own exactly four files and may create or edit nothing else:
>
> - `apps/api/src/source/rng.ts`
> - `apps/api/src/source/synthetic.ts`
> - `apps/api/test/generator.test.ts`
> - `docs/log/ws-generator.md`
>
> plus append-only additions at the bottom of `docs/BUILD_LOG.md`.
>
> ### 2.0 The framing, because it inverts the obvious approach
>
> This is **not** "generate realistic payments and see what they sum to." A naive random draw will never land on 960 payments summing to exactly `120_000_000` paise, split 640/85/55/145/35 across five rails with per-slice grosses of exactly `72_000_000 / 12_000_000 / 6_000_000 / 24_000_000 / 6_000_000`.
>
> It is: **given a seed and a set of slice targets, partition each target into a plausible number of plausible payments.** The totals are inputs. The seed varies only the *shape* — ticket-size distribution, day-of-cycle spread, which payments carry a refund, which attempts fail, which rails are present at all in a non-canonical cycle.
>
> `partition()` from the seam already guarantees the sums land exactly and already does the residual correction. `MEERA_CYCLE` already uses it without an rng. This stream adds two things and only two: **the seeded rng**, and **the realism**.
>
> Put that paragraph, in your own words, in a doc comment at the top of `synthetic.ts`.
>
> ### 2.1 `apps/api/src/source/rng.ts`
>
> A seeded mulberry32. Deterministic, pure, no dependency, and **no `Math.random` anywhere in this workstream** — the acceptance criteria grep for it.
>
> ```ts
> /** 32-bit string hash (xmur3 or FNV-1a). Same string in, same uint32 out, forever. */
> export function hashSeed(seed: string): number;
>
> /** mulberry32. Returns a generator of floats in [0, 1). */
> export function mulberry32(a: number): () => number;
>
> /** Convenience: rngFor("meera-2026-08:payments"). */
> export function rngFor(seed: string): () => number;
>
> /** Inclusive integer in [lo, hi]. Throws when hi < lo. */
> export function intBetween(rng: () => number, lo: number, hi: number): number;
>
> /** Uniform pick. Throws on an empty array. */
> export function pick<T>(rng: () => number, xs: readonly T[]): T;
>
> /** Fisher–Yates, returns a NEW array, does not mutate the input. */
> export function shuffled<T>(rng: () => number, xs: readonly T[]): T[];
> ```
>
> **Sub-streams, and this is the point of `rngFor` taking a string.** Derive an independent generator per concern: `rngFor(seed + ":payments")`, `":timestamps"`, `":refunds"`, `":disputes"`, `":failed"`, `":spec"`. Never share one generator across concerns. If payments and refunds draw from one stream, adding a single refund shifts every payment amount and the canonical seed stops reproducing — that is a 40-minute debugging session at 21:00 for a five-minute design decision now.
>
> `generate()` must construct its generators fresh on every call. **No module-level rng state.** Two calls with the same seed must deep-equal, and acceptance 9 asserts it.
>
> ### 2.2 `apps/api/src/source/synthetic.ts` — the exports
>
> ```ts
> import type { Instrument, Paise, Policy } from "@assay/contract";
> import type { RawCycle, RawMerchant, RawSettlementFacts } from "../domain/raw.js";
> import type { SettlementSource } from "../domain/source.js";
>
> export const CANONICAL_SEED = "meera-2026-08";
>
> /** Meera's five earlier cycles. Also the backtest corpus for the Wave-2 stretch. */
> export const HISTORICAL_SEEDS: readonly string[];   // exactly 5 entries
>
> /** [CANONICAL_SEED, ...HISTORICAL_SEEDS]. Length 6. */
> export const SEEDS: readonly string[];
>
> export interface SliceTarget {
>   instrument: Instrument;
>   reportedAs: string;          // "UPI" | "Card" | "Netbanking" | "Wallet"
>   grossPaise: Paise;           // positive; must be >= paymentCount
>   paymentCount: number;        // positive integer
> }
>
> /** Everything the seed decides, before a single event object exists. */
> export interface CycleSpec {
>   seed: string;
>   cycleId: string;
>   cycleLabel: string;          // "August 2026"
>   settlementId: string;
>   periodStart: number;
>   periodEnd: number;
>   settledAt: number;
>   merchant: RawMerchant;
>   slices: SliceTarget[];
>   refundCount: number;
>   refundTotalPaise: Paise;
>   disputeCount: number;
>   disputeUnitPrincipalPaise: Paise;   // UNIFORM within a cycle — see 2.5
>   failedAttemptCount: number;
>   onDemand: boolean;
>   onDemandBasePaise: Paise;
>   feesPaise: Paise;            // the simulated rail's settlement.fees
>   taxPaise: Paise;             // the simulated rail's settlement.tax
> }
>
> export function specFor(seed: string): CycleSpec;
> export function generate(seed: string): RawCycle;
>
> /** The simulated rail's own net. See 2.6 — this is deliberately a second implementation. */
> export function statedNetOf(spec: CycleSpec, policy: Policy): Paise;
>
> /** Structural self-check over a generated cycle. [] means pass. */
> export function checkCycle(cycle: RawCycle): string[];
>
> /** Replaces Batch 2's throwing stub. */
> export function syntheticSource(seeds?: readonly string[]): SettlementSource;
> ```
>
> `syntheticSource` returns an object with `kind: "synthetic"` satisfying Batch 2's `SettlementSource` **exactly as defined** in `apps/api/src/domain/source.ts` — `listCycles()` and `getCycle(id)`, both async. Do not redesign the interface, do not rename its methods, do not redefine `CycleRef`. `listCycles()` maps `seeds ?? SEEDS` through `specFor` and returns refs newest-first (canonical first). `getCycle(id)` matches on `cycleId` and returns `null`, never throws, on an unknown id. Memoise per seed through `memo("synthetic", seed, ...)` from `apps/api/src/store.ts` — generating six cycles per request is wasteful and the Map is already there.
>
> **This file reads no environment variable.** `ASSAY_SOURCE` and any `ASSAY_SEED` selection are WS-5's `config.ts`. You export a factory; WS-5 calls it. If Batch 2 left an env-reading selector in a file you do not own, leave it alone and tell Rafi in one line that `syntheticSource()` is ready to be wired.
>
> ### 2.3 `specFor(seed)` — the canonical seed is a literal, every other seed is drawn
>
> **For `CANONICAL_SEED` and only for it, return a hand-typed literal spec.** Section 3 gives every number. Its `cycleId`, `settlementId`, `cycleLabel`, `periodStart`, `periodEnd`, `settledAt` and `merchant` are literals copied from the table, **not minted**, because WS-1's `Explanation` for this cycle must be byte-identical to the fixture Javeria's mock already served her.
>
> For any other seed, draw the spec from `rngFor(seed + ":spec")`, within these bounds:
>
> - **Identity from the seed's month.** A seed of the form `meera-YYYY-MM` yields:
>   ```
>   periodStart  Date.parse(`${YYYY}-${MM}-01T00:00:00.000+05:30`)
>   periodEnd    periodStart + daysInMonth(YYYY, MM) * 86_400_000 - 1
>   settledAt    Date.parse(`${nextYYYY}-${nextMM}-03T11:00:00.000+05:30`)
>   cycleLabel   "July 2026"   // long month name, space, year
>   cycleId      mintCycleId(seed)
>   settlementId mintSettlementId(seed)
>   ```
>   Sanity-check the formula against the canonical month before you trust it: `Date.parse("2026-08-01T00:00:00.000+05:30")` is `Date.parse("2026-07-31T18:30:00.000Z")`, and `Date.parse("2026-09-03T11:00:00.000+05:30")` is `Date.parse("2026-09-03T05:30:00.000Z")`. If your helper reproduces the canonical three timestamps, it is right. Reject a seed that does not match `/^[a-z0-9-]+-\d{4}-\d{2}$/` with a clear `Error`.
> - **Merchant:** the same `RawMerchant` as canonical — same id, name, segment, plan, `constructed: true`. Meera does not change plan between cycles.
> - **Slices:** 3 to 6, drawn without replacement from the seven `Instrument` values. Per-slice `grossPaise` drawn in `[2_000_000, 90_000_000]`, rounded to whole rupees via `rupees()`. `paymentCount` drawn so the mean ticket lands in `[30_000, 400_000]` paise (₹300 to ₹4,000) — a believable D2C skincare basket. `reportedAs` follows the same mapping the calculator uses: `upi_*` → `"UPI"`, `card_*` → `"Card"`, `netbanking` → `"Netbanking"`, `wallet` → `"Wallet"`.
> - **Refunds:** count in `[0.02, 0.06] × total payments`, total in `[1.5%, 4%]` of gross.
> - **Disputes:** 0 to 4. `disputeUnitPrincipalPaise` drawn in `[50_000, 500_000]`.
> - **Failed attempts:** in `[0.6, 1.6] × total payments`.
> - **On-demand:** present in roughly half the seeds. When present, `onDemandBasePaise` is 10–40% of gross, `feesPaise` and `taxPaise` are drawn as plausible rail-returned amounts with `taxPaise === bps(feesPaise, 1800)`. When absent, `onDemand: false` and both are `0`.
>
> **Coverage requirement, and it is asserted.** Across `SEEDS`, at least one cycle must carry a `wallet` slice — that is the only way `attributionOf`'s else-branch is exercised on data it has never seen — and at least one must carry **both** `card_debit` and `card_credit`, which is the only way two slices share a `reportedAs` in a single cycle. Start with the five seed strings in section 3. If the drawn specs do not satisfy the coverage assertion, **change the seed strings until they do — never special-case the drawing algorithm to force it.** A forced slice is not a test of anything.
>
> ### 2.4 `generate(seed)` — from spec to events
>
> All money splitting goes through `partition()`. **This file never divides money itself.** No `Math.round`, no `/`, no `* 100` on a paise value — use `rupees()` and `bps()` from `@assay/contract`.
>
> **Payments.** For each slice: `shuffled(rngFor(seed + ":payments:" + slice.instrument), partition(slice.grossPaise, slice.paymentCount, rng))`. The shuffle matters: `partition` puts the residual on the last element, so without a shuffle every slice ends in a systematically odd-sized ticket. The shuffle preserves the sum exactly. Mint ids as `pay_<seed-hash>_<index>` or similar — payment ids are ours and are not regex-constrained by the contract, but keep them stable and unique.
>
> **`capturedAt`.** Spread deterministically across `[periodStart, periodEnd]`: base at `periodStart + floor(i * span / count)`, then a seeded intra-day offset from `rngFor(seed + ":timestamps")`, then **clamp into the range**, then sort the whole payments array ascending by `capturedAt`. Realism you may add if time allows and must not add if it costs you the clock: weight toward evenings and away from the first three days of the month.
>
> **Refunds — the trap.** `partition(refundTotalPaise, refundCount, rng)` gives 41 parts, but a part may exceed the amount of a randomly chosen host payment, which would be an impossible refund and would fail `checkCycle`. Do it deterministically and it can never happen: **sort the refund parts descending, sort the payments descending by `amountPaise`, and zip.** The largest refund lands on the largest payment. Then `refundedAt` = a seeded instant in `[payment.capturedAt, periodEnd]`. If the largest part still exceeds the largest payment, the drawn spec is bad — throw with a message naming both numbers rather than silently clamping.
>
> **Disputes.** `disputeCount` payments chosen from those with `amountPaise >= disputeUnitPrincipalPaise`, via `rngFor(seed + ":disputes")`, without replacement. Every dispute in a cycle carries `principalPaise === spec.disputeUnitPrincipalPaise` — see 2.5. `raisedAt` in `[payment.capturedAt, periodEnd]`.
>
> **Failed attempts.** `failedAttemptCount` records. `instrument` drawn from the slices present, weighted by payment count. `errorCode` picked from a small plausible rotating set (`"BAD_REQUEST_ERROR"`, `"GATEWAY_ERROR"`, `"payment_failed"`, `"insufficient_funds"`, `"authentication_failed"`) — nothing reads it tonight, but a generator that emits the same string 1,100 times looks like a stub on camera. `attemptedAt` spread across the period, same treatment as `capturedAt`.
>
> **Settlement facts.** `settlementId` from the spec, `settledAt` from the spec, `onDemand`, `onDemandBasePaise`, `feesPaise`, `taxPaise` all straight off the spec. `status: "settled"`.
>
> **`statedNetPaise`:** `statedNetOf(spec, COMMITTED_POLICY)`.
>
> ### 2.5 The uniform-dispute rule, stated once so it is not rediscovered at 21:40
>
> `ExplanationLine` L-05 carries a single `unitAmount`. The calculator emits `unitAmount: <principal per dispute>` and a formula reading `"2 disputes × ₹2,700"`. If two disputes in one cycle carried different principals, that line would be a lie. **Within a cycle, every dispute carries the identical `principalPaise`.** Vary it across seeds, never within one.
>
> ### 2.6 `statedNetOf` — why this is a second implementation on purpose
>
> `RawCycle.statedNetPaise` is what the rail says landed. The seam's comment on that field is load-bearing: if the calculator derived it from its own lines, `reconciliation.delta === 0` would be a tautology instead of an assertion. **You are the rail.** Your job is to produce that number by an arithmetic path that is independent of `apps/api/src/engine/**`.
>
> Rules, all four enforced by acceptance criteria:
>
> 1. `statedNetOf` **must not import anything from `apps/api/src/engine/**`.** Not `calculate`, not `applyPolicy`, not a helper. Grep-checked.
> 2. It reads rates **only** off the passed `Policy`'s `PolicyLine` fields — `rateBps` for P-01 and P-02, `fixedAmount` for P-03 and P-04 — and off `spec.feesPaise` / `spec.taxPaise` for P-05. **No rate is typed into this file.** `200`, `1800`, `300` and `50000` must not appear as money literals anywhere in `synthetic.ts`; the acceptance greps for them.
> 3. It is a single straight-line expression, written out, not a loop over policy lines that happens to mirror WS-1's. The duplication is the point.
> 4. It throws if any policy line it reads is unapproved, or if P-01/P-02 have a null `rateBps`, or P-03/P-04 a null `fixedAmount`.
>
> The expression, in this order:
>
> ```
> gateway   = bps(gross, P-01.rateBps)
> statedNet = gross
>           - gateway
>           - refundTotalPaise
>           - bps(gateway, P-02.rateBps)
>           - failedAttemptCount * P-03.fixedAmount
>           - disputeCount * disputeUnitPrincipalPaise
>           - disputeCount * P-04.fixedAmount
>           - (onDemand ? feesPaise + taxPaise : 0)
> ```
>
> Note `gateway` is a percentage of **gross**, not of gross-minus-refunds. That is what the fixture does and matching it is not optional.
>
> For the canonical spec this must return exactly `112_891_800`. Walk it once by hand before you run anything; section 3 gives the intermediate at every step.
>
> ### 2.7 `checkCycle(cycle)` — the invariants that need no authored expected output
>
> Returns an array of human-readable problem strings; `[]` means pass. This is how five seeds are validated without anyone hand-typing five expected outputs. Every one of these must hold for every seed:
>
> 1. `sum(payments.amountPaise) === sum(slice.grossPaise over the spec's slices)`, and every `amountPaise >= 1` and is an integer.
> 2. `payments.length === sum(slice.paymentCount)`.
> 3. `sum(refunds.amountPaise) === spec.refundTotalPaise`, `refunds.length === spec.refundCount`.
> 4. Every refund's `paymentId` resolves to a real payment, and `refund.amountPaise <= thatPayment.amountPaise`.
> 5. Every dispute's `paymentId` resolves, `principalPaise <= thatPayment.amountPaise`, and all disputes share one `principalPaise`.
> 6. Every `capturedAt`, `refundedAt`, `raisedAt`, `attemptedAt` lies inside `[periodStart, periodEnd]`. Every `refundedAt >= host.capturedAt`; same for `raisedAt`.
> 7. `settlement.settledAt >= periodEnd` and `settlement.settledAt === cycle`-spec `settledAt`.
> 8. `taxPaise === bps(feesPaise, 1800)` when `onDemand`; both `0` when not. *(1800 here is the statutory GST rate being asserted about a rail-returned pair, not a rate used to compute a merchant-facing rupee — put that sentence in a comment so a later grep does not read it as a §4.1 violation.)*
> 9. `statedNetPaise > 0`, is an integer, and `statedNetPaise < sum(payments.amountPaise)`.
> 10. `CycleId.parse(cycle.cycleId)` and `SettlementId.parse(cycle.settlement.settlementId)` both succeed against the **frozen Zod schemas imported from `@assay/contract`** — do not retype the regexes.
> 11. Every payment id, refund id, dispute id and failed-attempt id is unique within the cycle.
>
> ### 2.8 `apps/api/test/generator.test.ts`
>
> `node:test` + `node:assert/strict`, run by `tsx --test test/*.test.ts`.
>
> **Test 1 — the canonical seed reproduces Meera's aggregates.** `const g = generate(CANONICAL_SEED);` then assert, individually so a failure names itself:
>
> ```
> g.cycleId              === MEERA_CYCLE.cycleId
> g.cycleLabel           === MEERA_CYCLE.cycleLabel
> g.periodStart          === MEERA_CYCLE.periodStart
> g.periodEnd            === MEERA_CYCLE.periodEnd
> g.status               === "settled"
> deepEqual(g.merchant,     MEERA_CYCLE.merchant)
> g.payments.length      === 960
> sum(g.payments)        === 120_000_000
> per-slice gross/count  === 640/72_000_000, 85/12_000_000, 55/6_000_000, 145/24_000_000, 35/6_000_000
> g.refunds.length       === 41
> sum(g.refunds)         === 3_200_000
> g.disputes.length      === 2  and every principalPaise === 270_000
> g.failedAttempts.length=== 1_100
> g.settlement.settlementId === MEERA_CYCLE.settlement!.settlementId
> g.settlement.settledAt === MEERA_CYCLE.settlement!.settledAt
> g.settlement.onDemandBasePaise === 30_000_000
> g.settlement.feesPaise === 90_000
> g.settlement.taxPaise  === 16_200
> g.statedNetPaise       === 112_891_800
> ```
>
> **`generate(CANONICAL_SEED)` is NOT deep-equal to `MEERA_CYCLE` and must never be asserted to be.** `MEERA_CYCLE` calls `partition` without an rng, so its individual ticket amounts, ids and timestamps differ from yours. Only the aggregates above and the identity fields match. If you find yourself reverse-engineering `partition`'s no-rng output to force a deep-equal, stop — you are 40 minutes from nothing. And `meera.ts` is not yours to edit under any circumstances: it is the target this stream reproduces, not a file you may bend to make yourself pass.
>
> **Test 2 — determinism.** For every seed in `SEEDS`: `assert.deepStrictEqual(generate(s), generate(s))`. Also assert `generate(SEEDS[0]) !== generate(SEEDS[1])` in gross, payment count and `statedNetPaise` — different seeds must be genuinely different arithmetic, not the same cycle relabelled.
>
> **Test 3 — invariants over every seed.** For every seed in `SEEDS`: `assert.deepEqual(checkCycle(generate(s)), [])`.
>
> **Test 4 — id conformance.** For every seed, parse `cycleId` with `CycleId` and `settlement.settlementId` with `SettlementId` from `@assay/contract`. Assert `SEEDS.length === 6`.
>
> **Test 5 — coverage.** At least one seed's cycle contains a `wallet` payment; at least one contains both `card_debit` and `card_credit`.
>
> **Test 6 — the calculator round-trip. Write this last, after rebasing onto WS-1's `calculate.ts`.**
>
> ```ts
> assert.deepEqual(
>   calculate(generate(CANONICAL_SEED), COMMITTED_POLICY),
>   calculate(MEERA_CYCLE, COMMITTED_POLICY),
> );
> ```
>
> This is the whole point of the stream in one assertion: the generator is a drop-in replacement for the hand-written cycle, at the only boundary anyone downstream can see. If it fails, the diff tells you exactly which aggregate you got wrong.
>
> **Test 7 — every seed survives the engine.** For every seed: `const e = calculate(generate(s), COMMITTED_POLICY);` then `Explanation.parse(e)` succeeds, `e.reconciliation.delta === 0`, `e.reconciliation.ok === true`, and `checkWaterfall(e)` from `tools/invariants/waterfall.ts` returns `[]`. `checkWaterfall` checks a payload, not an implementation, so importing it here is safe — but **you do not edit that file**; it is WS-1's.
>
> If `calculate.ts` is not on `main` when you reach tests 6 and 7, commit tests 1–5 and come back. Never push a red suite.
>
> ### 2.9 Wave-2 stretch — abandon at 21:30, no negotiation
>
> `HISTORICAL_SEEDS` already gives five sealed prior cycles, newest-first, each with `status: "settled"` and a real `statedNetPaise`. That is the entire backtest corpus. Hand WS-4 (`forecast.ts`) a one-line export it can consume:
>
> ```ts
> export function historicalCycles(): RawCycle[];   // HISTORICAL_SEEDS mapped through generate, newest first
> ```
>
> Tell the WS-4 agent in one line that it exists. **You do not write the backtest and you do not touch `forecast.ts`.** If it is 21:30 and this is not exported, stop: `backtest.cycles: 0` rendering as "accuracy not yet measured" is the honest, shipped, already-correct behaviour, and a half-wired backtest that reports a fabricated error figure is strictly worse than no backtest. That is the cut order and it was decided at 17:45.

---

## 3. Every number you need

`rupees(x) = x * 100`. Money is integer paise. Do not derive these, do not recompute them, do not guess.

### The canonical spec — `CANONICAL_SEED = "meera-2026-08"`

| Field | Value |
|---|---|
| `cycleId` | `"cyc_202608"` (literal, not minted) |
| `cycleLabel` | `"August 2026"` |
| `settlementId` | `"stl_2608mera01"` (literal, not minted) |
| `periodStart` | `Date.parse("2026-07-31T18:30:00.000Z")` |
| `periodEnd` | `Date.parse("2026-08-31T18:29:59.999Z")` |
| `settledAt` | `Date.parse("2026-09-03T05:30:00.000Z")` |
| `merchant.id` | `"mer_meera01"` |
| `merchant.name` | `"Meera"` |
| `merchant.segment` | `"D2C skincare, ₹12L/month"` |
| `merchant.planLabel` | `"Flat 2% — all instruments"` (em dash U+2014, spaced) |
| `merchant.planHeadlineBps` | `200` |
| `merchant.constructed` | `true` |

### The five slice targets — sum to 960 payments and `120_000_000` paise, exactly

| # | `instrument` | `reportedAs` | `grossPaise` | `paymentCount` | mean ticket |
|---|---|---|---:|---:|---:|
| 1 | `upi_bank_account` | `UPI` | `72_000_000` | 640 | ₹1,125.00 |
| 2 | `upi_rupay_credit` | `UPI` | `12_000_000` | 85 | ₹1,411.76 |
| 3 | `upi_ppi` | `UPI` | `6_000_000` | 55 | ₹1,090.91 |
| 4 | `card_credit` | `Card` | `24_000_000` | 145 | ₹1,655.17 |
| 5 | `netbanking` | `Netbanking` | `6_000_000` | 35 | ₹1,714.29 |

### The rest of the canonical spec

| Field | Rupees | Paise |
|---|---:|---:|
| `refundCount` | — | `41` |
| `refundTotalPaise` | ₹32,000.00 | `3_200_000` |
| `disputeCount` | — | `2` |
| `disputeUnitPrincipalPaise` | ₹2,700.00 | `270_000` |
| `failedAttemptCount` | — | `1_100` |
| `onDemand` | — | `true` |
| `onDemandBasePaise` | ₹3,00,000.00 | `30_000_000` |
| `feesPaise` | ₹900.00 | `90_000` |
| `taxPaise` | ₹162.00 | `16_200` |

### `statedNetOf` on the canonical spec — the walk, step by step

| Step | Operation | Running |
|---|---|---:|
| gross | `Σ slice.grossPaise` | `120_000_000` |
| − gateway | `bps(120_000_000, 200)` = `2_400_000` | `117_600_000` |
| − refunds | `3_200_000` | `114_400_000` |
| − GST | `bps(2_400_000, 1800)` = `432_000` | `113_968_000` |
| − failed | `1_100 × 300` = `330_000` | `113_638_000` |
| − dispute principal | `2 × 270_000` = `540_000` | `113_098_000` |
| − dispute fee | `2 × 50_000` = `100_000` | `112_998_000` |
| − on-demand | `90_000 + 16_200` = `106_200` | **`112_891_800`** |

`112_891_800` = ₹11,28,918.00 = `MEERA_CYCLE.statedNetPaise` = `F.NET_CREDITED`. If your walk lands anywhere else, the bug is in `statedNetOf`, not in `partition`.

### Downstream figures this cycle must produce, for your own orientation

These belong to WS-1 and WS-3; you never compute them. They are here so you can recognise a correct round-trip when you see one.

| Quantity | Paise |
|---|---:|
| `merchantExpected` (gross − 2% − refunds) | `114_400_000` |
| `unexplainedGap` | `1_508_200` |
| `totalDelta` (gross − net) | `7_108_200` |
| `basisUnverifiable` (the gateway fee) | `2_400_000`, share `0.3376` |
| `basisVerifiable` | `4_708_200`, share `0.6624` |
| Fee on the zero-statutory-MDR rail | `1_440_000` (₹14,400) |

### The five further seeds — starting strings, changeable until coverage passes

```
"meera-2026-07"   "meera-2026-06"   "meera-2026-05"   "meera-2026-04"   "meera-2026-03"
```

Change the strings, never the drawing algorithm, if the coverage assertion in test 5 does not hold.

### The seven instruments, in the calculator's order

`upi_bank_account`, `upi_rupay_credit`, `upi_ppi`, `card_debit`, `card_credit`, `netbanking`, `wallet`

`reportedAs` mapping: `upi_*` → `"UPI"`, `card_*` → `"Card"`, `netbanking` → `"Netbanking"`, `wallet` → `"Wallet"`.

---

## 4. Sole ownership

**You may create or edit exactly these:**

- `apps/api/src/source/rng.ts`
- `apps/api/src/source/synthetic.ts`
- `apps/api/test/generator.test.ts`
- `docs/log/ws-generator.md`
- `docs/BUILD_LOG.md` — **append only**, at the bottom, under a `## WS-2 · synthetic generator` heading. Never reflow, reorder or edit a line another agent wrote. `git pull --rebase` immediately before every push that touches it.

**You must not touch any of these, and each has a named owner:**

| Path | Owner | Why |
|---|---|---|
| `packages/contract/**` | nobody — **frozen at v0.1.0** | A change here is refused, not escalated |
| `apps/api/src/domain/**` | WS-0 | Especially `meera.ts`. `MEERA_CYCLE` is the target you reproduce, not a file you may edit to make yourself pass |
| `apps/api/src/engine/**` | WS-1, WS-3, WS-4 | You produce a `RawCycle` and know nothing about `Explanation`. Import from here in the test; never write here |
| `apps/api/src/source/live.ts` | WS-7 | Same directory, different stream |
| `apps/api/src/routes/**`, `index.ts`, `config.ts`, `engine-*.ts`, `boot-selftest.ts` | WS-5 | Including all env-var reading |
| `apps/api/src/ops/**`, `apps/api/src/policy/**` | WS-6 | |
| `tools/invariants/**` | WS-1, WS-3, WS-4 | `waterfall.ts` is WS-1's — import it, do not edit it |
| `tools/verify-contract.ts`, `render.yaml`, `.github/workflows/**` | WS-5 | |
| `README.md`, `docs/adr/**`, `docs/SUBMISSION.md` | WS-8 | |
| `package.json`, `apps/api/package.json`, `pnpm-lock.yaml` | WS-0 | **You install no dependency.** The RNG is 12 lines of arithmetic |
| `apps/api/test/*.test.ts` other than `generator.test.ts` | one stream each | |

If you believe you need a change under `apps/api/src/domain/**`: it is an **additive optional field** → make it and announce it in one line; anything else → stop and escalate to WS-0's agent. `as any` and `@ts-expect-error` are banned under `apps/api/src` and the pre-push hook enforces it. Reaching for either is the signal to escalate, not to proceed.

---

## 5. Standing instruction — the build log

**Whenever something breaks or surprises you, append two or three sentences to `docs/BUILD_LOG.md` in the moment.** Not at the end, not from memory. This feeds the application form's *"what broke, and how you got out"* — the section Razorpay reads first.

Write only real engineering judgement: a wrong assumption you held and what corrected it, a constraint you discovered the hard way, a design you changed and why the first one could not work. Name the number or the assertion that caught it.

Do not write dependency-version stories, install failures, tooling noise, or anything a reader would skim. If nothing broke in an hour, write nothing for that hour.

Candidates this stream is likely to actually hit, and each is worth logging if it happens:

- Discovering the inversion — that totals are inputs and the seed varies shape — after a first attempt at drawing amounts and hoping they summed.
- The refund-exceeds-its-host-payment case, and the sorted-zip that makes it structurally impossible rather than statistically unlikely.
- The realisation that `L-05`'s single `unitAmount` field forces disputes to be uniform within a cycle — a contract shape dictating a generator constraint.
- Sharing one rng across concerns and watching the canonical seed stop reproducing when an unrelated count changed.
- Whether `statedNetOf` as a deliberate second implementation actually caught anything, or merely agreed. **Both outcomes are worth one honest sentence.** If it only ever agreed, say so.

Mirror the same entries into `docs/log/ws-generator.md`, which you own outright and may format however you like.

---

## 6. Acceptance criteria

Every one is objectively checkable. Run them; do not reason about them.

1. `pnpm typecheck` is green across the workspace.
2. `pnpm test` is green, and `apps/api/test/generator.test.ts` contributes at least 7 passing tests.
3. `grep -rn "Math.random\|Date.now()\|new Date()" apps/api/src/source/rng.ts apps/api/src/source/synthetic.ts` returns **nothing**. The generator is a pure function of its seed.
4. `grep -rnE "from \"\.\./engine/|from '\.\./engine/" apps/api/src/source/synthetic.ts` returns **nothing** — `statedNetOf` is independent of the calculator by construction, not by intention.
5. `grep -nE "\b(200|1800|300|50000|2700|270000)\b" apps/api/src/source/synthetic.ts` returns no line where the number is used as a **rate or a fee amount**. Rates come off the passed `Policy`; the canonical spec's `270_000` dispute principal and the `1800` in `checkCycle`'s tax assertion are the only permitted appearances and each carries a comment saying which it is.
6. `generate("meera-2026-08")` matches `MEERA_CYCLE` on every field listed in test 1 of section 2.8 — 960 / `120_000_000`, the five slice grosses and counts, 41 / `3_200_000`, 2 × `270_000`, 1,100, `90_000`, `16_200`, `30_000_000`, `112_891_800`, and the four identity/timestamp fields.
7. `assert.deepEqual(calculate(generate("meera-2026-08"), COMMITTED_POLICY), calculate(MEERA_CYCLE, COMMITTED_POLICY))` passes.
8. For all six seeds: `checkCycle(generate(seed))` returns `[]`, `Explanation.parse(calculate(generate(seed), COMMITTED_POLICY))` succeeds, `reconciliation.delta === 0`, and `checkWaterfall(...)` returns `[]` — **with no authored expected output anywhere in the test for the five non-canonical seeds.**
9. For all six seeds: `assert.deepStrictEqual(generate(seed), generate(seed))`.
10. For all six seeds: `CycleId.parse(cycle.cycleId)` and `SettlementId.parse(cycle.settlement.settlementId)` succeed against the frozen Zod schemas imported from `@assay/contract`.
11. Across the six seeds, at least one cycle contains a `wallet` payment and at least one contains both `card_debit` and `card_credit`.
12. `syntheticSource()` satisfies Batch 2's `SettlementSource` unmodified: `kind === "synthetic"`, `listCycles()` returns 6 refs canonical-first, `getCycle("cyc_202608")` returns the canonical cycle, `getCycle("cyc_nope99")` returns `null` without throwing. Batch 2's `"synthetic source lands in Batch 3"` throw is gone.
13. `apps/api/src/source/synthetic.ts` reads no `process.env`.
14. The pre-push hook passed on every commit — no `as any`, no `@ts-expect-error` under `apps/api/src`.
15. `git status` shows changes only under `apps/api/src/source/{rng,synthetic}.ts`, `apps/api/test/generator.test.ts`, `docs/log/ws-generator.md`, and appended lines at the bottom of `docs/BUILD_LOG.md`.
16. **Proof due 20:15.** Paste the `pnpm test` output for the generator file into chat at 20:15 whatever state it is in.

Stretch, and only if it is before 21:30:

17. `historicalCycles()` exports five sealed prior `RawCycle`s newest-first, each with `status: "settled"` and a positive `statedNetPaise`, and the WS-4 agent has been told in one line that it exists.

---

## 7. Report back

When you stop — at completion, at 20:15, or at the 21:30 stretch abandon, whichever comes first — report exactly this, in chat, in under twelve lines:

1. **Acceptance 6 and 7: pass or fail.** If fail, name the specific aggregate that differs and by how many paise. Nothing else in this brief matters as much as these two.
2. Which of criteria 1–16 pass. State the numbers that fail as numbers, not as prose.
3. `statedNetOf(canonicalSpec, COMMITTED_POLICY)` — the actual returned value. It should read `112891800`.
4. The five non-canonical seed strings you shipped, and confirmation that test 5's coverage assertion holds without special-casing.
5. Whether `historicalCycles()` shipped, and if not, that WS-4 should keep `backtest.cycles: 0`.
6. Anything you changed outside your four files, with the one-line announcement you made about it.
7. One line: what broke and how you got out. If it is already in `docs/BUILD_LOG.md`, say which entry.
