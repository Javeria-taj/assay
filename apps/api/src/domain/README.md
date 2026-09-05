# `apps/api/src/domain/` — the seam

Everything in this directory is **wave 0's**. Three wave-1 streams build against
it concurrently, which is only possible because the types between them are
settled. That is the whole reason the directory exists.

## The rule

**No wave-1 stream edits a file in here.** Not to add a field it needs, not to
fix a name it dislikes, not to work around a function it disagrees with. A
stream that edits the seam breaks the two streams compiling against it at that
moment, and neither of them will know why.

## The amendment protocol

| Change | What to do |
|---|---|
| **Additive optional field** — a new `foo?: T` nothing else reads | Make it, and announce it in one line. No approval needed. |
| **Anything else** — a rename, a narrowing, a required field, a signature change, a behaviour change | **Stop and escalate.** Say which input produced which wrong output and what you expected. Do not edit. Do not privately reimplement the thing you disagree with. |

Reaching for `as any` or `@ts-expect-error` is the signal to escalate, not a way
to proceed. Both are banned under `apps/api/src`.

## Why a private reimplementation is worse than an escalation

`attributionOf` is the example. It keys on `reportedAs`, and if a stream decides
it "should" key on `citation.sourceId` and quietly writes its own copy, that
stream's numbers drift from the other stream's by ₹14,400 — and both look
internally consistent. The divergence surfaces at merge, at the worst possible
hour, as two correct-looking answers that disagree.

## What lives here, and who consumes it

| File | Consumed by |
|---|---|
| `instrument.ts` | everyone — the rails, the statutory MDR table |
| `raw-cycle.ts` (alias `raw.ts`) | the generator produces it, the calculator reads it |
| `meera.ts` | the canonical cycle; every stream reproduces or reads it |
| `committed-policy.ts` | the calculator; re-exports the contract's own `POLICY` |
| `attribution.ts` | the calculator (`collapsedInReport`) and the ceiling (`missingFields`) |
| `copy.ts` | every merchant-facing string the engine emits |
| `lines.ts` | the calculator — `LineDraft`, `seal`, `ReconcileError` |
| `partition.ts` | the generator and `meera.ts` |
| `ids.ts` | the generator |
| `policy.ts`, `computed.ts`, `ceiling.ts`, `dispute-window.ts`, `report.ts`, `forecast.ts` | the internal domain vocabulary |

## One thing the seam will not do

It will not hold a number that belongs in `@assay/contract`. The contract is
frozen at v0.1.0 and a change there is **refused, not escalated**. If the only
way forward is a contract edit, the answer is no.
