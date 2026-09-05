# PATHS — the reconciled layout

**Read this before the brief. Where the two disagree, this file wins.**

The three wave-1 briefs were authored against an assumed layout. The repo
differs, and where it does, **the repo is right and the brief is wrong** — no
agent renames an existing file to match its brief.

---

## 1. Path map

| The brief says | The repo has | Note |
|---|---|---|
| `apps/api/src/source/` | **`apps/api/src/sources/`** (plural) | Batch 2 created it. Use the plural. |
| `apps/api/src/domain/raw.ts` | **`apps/api/src/domain/raw-cycle.ts`** | `raw.ts` exists as a re-export alias, so either import path resolves. Prefer `raw-cycle.js`. |
| `apps/api/src/domain/source.ts` | **`apps/api/src/sources/source.ts`** | `domain/source.ts` re-exports it. |
| `apps/api/test/*.test.ts` | **`apps/api/test/`** — created, empty | Put your test there. The wave-0 gate lives at `apps/api/src/engine/golden.test.ts` and is not yours. |
| `pnpm hooks` / `tools/githooks` | **does not exist** | There is no pre-push hook. Run the greps in your acceptance criteria yourself. |

Import specifiers end in `.js` even though the files are `.ts` — that is the
TypeScript convention this repo uses throughout. Copy the style of a neighbouring
import rather than inventing one.

---

## 2. What the seam actually exports

All of this exists on `main` now and typechecks. **Confirm before you build; do
not assume a brief's export list.**

| Module | Exports |
|---|---|
| `domain/instrument.ts` | `Instrument`, `INSTRUMENTS`, `NETWORK_MDR_BPS`, `ZERO_MDR_BY_STATUTE` |
| `domain/raw-cycle.ts` | `RawCycle`, `CycleRef`, `RawMerchant`, `RawPayment`, `RawRefund`, `RawDispute`, `RawFailedAttempt`, `RawSettlementFacts`, `SourceGap` |
| `domain/meera.ts` | `MEERA_CYCLE`, `MEERA_SLICES`, `SliceTarget`, and the named constants |
| `domain/committed-policy.ts` | `COMMITTED_POLICY` — **is** the contract's own `POLICY`, re-exported |
| `domain/attribution.ts` | `MissingFieldId`, `MISSING_FIELD_ORDER`, `attributionOf`, `isStatutoryZeroMdr` |
| `domain/copy.ts` | `ceilingHeadline`, `CEILING_METHOD`, `GATEWAY_FEE_UNVERIFIABLE_REASON`, `MISSING_FIELD_COPY` |
| `domain/lines.ts` | `LineDraft`, `seal`, `ReconcileError` |
| `domain/partition.ts` | `partition(target, n, rng?)` |
| `domain/ids.ts` | `mintSettlementId`, `mintCycleId` |
| `store.ts` | `memo(namespace, key, make)`, `clearMemo` |
| `tools/invariants/index.ts` | `InvariantCheck`, `InvariantContext`, `checks[]` — your file is already registered |

### Field names that differ from the briefs

The briefs use these; the repo's `RawCycle` is the authority:

```
payment.amountPaise      refund.amountPaise      dispute.principalPaise
cycle.statedNetPaise     cycle.cycleLabel        cycle.settlement (RawSettlementFacts)
cycle.failedAttempts     — records, not a count
cycle.id                 — the stl_ id;  cycle.cycleId — the cyc_ id. Both exist, neither derives from the other.
merchant.planHeadlineBps — not `plan.headlineBps`
```

---

## 3. Architecture — the one real conflict, and how it is resolved

Wave 0 built an internal domain vocabulary (`ComputedSettlement`, `CeilingResult`)
with mappers in `engine/to-contract.ts`, and a rule that nothing below the route
layer imports `@assay/contract`.

**The briefs win.** They specify `calculate(cycle, policy): Explanation` and
`analyseCeiling(e: Explanation): Ceiling` — contract types, directly — and three
detailed briefs with precise acceptance criteria are built on that. So:

- **Engine files may import `@assay/contract` freely.** The wave-0 rule is lifted.
  Its remaining value is that `to-contract.ts` still asserts, at compile time,
  that the domain's `Instrument` and `LineKind` unions agree with the frozen ones.
- `engine/ports.ts` is a **stub layer, not a target.** Its `computeSettlement` /
  `analyseCeiling` signatures are superseded by your brief's. Do not implement
  against `ports.ts`; do not delete it either — WS-5 reconciles it later.
- `apps/api/src/engine/golden.test.ts` is wave 0's, not yours. Five of its six
  tests pass today and prove the seam; the sixth fails until the calculator lands.

---

## 4. The gate

`pnpm test:golden` currently reads **5 passing / 1 failing**, not `N/34`. The
`N/34` counter in the dispatch is the **calculator's own** `TIER-1 N/34` inside
`apps/api/test/calculator.test.ts`. Both are read; they are different numbers.

---

## 5. Corrections that override every brief

Verified against `packages/contract/src/fixtures.ts`.

1. **Attribution keys on `reportedAs`, never `citation.sourceId`.** Grouping by
   citation gives ₹3,600 for `instrument_subtype` — it silently drops ₹14,400,
   because the bank-UPI slice cites the statute rather than the collapse.
   Grouping by `reportedAs` gives ₹18,000 and the three fields sum to ₹24,000.
   Use `attributionOf`; do not reimplement it.
2. **`zeroMdrExposure` must not filter on `networkMdrBps === 0`.** Netbanking
   also carries 0 and is not statutory zero-MDR. The naive filter returns
   ₹15,600 against a fixture asserting ₹14,400. Use `isStatutoryZeroMdr`.
3. **`collapsedInReport` is not "another slice shares my `reportedAs`".**
   `card_credit` is alone in the mix and the fixture still says `true`. Derive it
   as `attributionOf(slice) !== "per_line_fee_basis"`.
4. **`basisVerifiable` is derived, never assigned.** A line is unverifiable when
   its computation leaned on a gap the source declared — read from
   `cycle.gaps` — not because someone hardcoded `false` on the gateway-fee line.
   `MEERA_CYCLE` declares `gap_instrument_sub_type` for exactly this reason.
   Implement it in one place; `grep -rn "basisVerifiable" apps/api/src` must show
   no hand-assignment outside it.

---

## 6. Boundaries

- **`packages/contract/**` is frozen at v0.1.0.** A change there is refused, not
  escalated.
- **`apps/api/src/domain/**` is wave 0's.** See `apps/api/src/domain/README.md`
  for the amendment protocol. Additive optional field: make it and announce it.
  Anything else: stop and report.
- **`docs/BUILD_LOG.md` is append-only.** Append under your own
  `## WS-n · <name>` heading at the bottom. Never reflow another agent's lines.
  Your own `docs/log/ws-<name>.md` is yours outright.
- Own only the files your brief lists. The three file sets are disjoint by
  construction, which is what makes the merge order irrelevant.
