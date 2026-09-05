# Assay — submission notes

## What Assay does

Assay takes one settlement cycle and one approved fee policy and puts the whole
waterfall on a single screen, every line citing the rule or the API field that
produced it. On the worked cycle — ₹12,00,000 captured, ₹11,28,918 credited —
every rupee of the ₹71,082 gross-to-net delta reconciles against the rail's own
figures, and ₹24,000 of it, **33.8%**, cannot be checked from the fields the
merchant is given. That third is the gateway fee itself: it is exactly right,
and she has no way to know that, because it spans five rails carrying different
statutory network MDR and three of them arrive on her report labelled
identically as `UPI`. Three fields close the gap exactly and do not overlap —
instrument sub-type ₹18,000, card BIN tier ₹4,800, per-line fee basis ₹1,200 —
and the engine derives that partition rather than asserting it. The claim of the
product is that reconciling and verifying are different questions, and only the
first one is being answered today.

## What is not real, said before anything else

Meera is constructed. Her ₹12,00,000 August volume, her instrument mix, her flat
2% plan, the ₹3 failed-payment charge and the ₹500 chargeback fee were chosen to
show scale at a believable Indian SMB — 960 payments, 41 refunds, 2 disputes and
1,100 failed attempts in one cycle. Every screen says so.

The arithmetic is correct and every rule underneath it is real: the three-day
discrepancy clause, zero statutory network MDR on UPI-from-bank-account (PSSA
§10A, Income-tax Act §269SU), GST at 18% on gateway fees, the instrument
sub-type distinctions, and the fact that the on-demand settlement response
carries `fees` and `tax` as integer paise. Assay is gateway-agnostic, runs on
synthetic data, and is never pointed at a named provider's real statement.

And the finding is not an accusation. The gateway fee is correct and uncheckable
— those are two different words and the product only ever says the second one.
The same discipline runs through the numbers: ₹7,20,000 of that volume moved on
a rail carrying zero network MDR by statute and still attracted ₹14,400 of fee
under a flat plan, ₹1,72,800 annualised. Legal, disclosed in the plan, and
absent from every report she is given.

---

## What broke, and how I got out

### 1. We said the field did not exist. It does — and the real finding is better

The ceiling analysis rested on a claim we had written into the README twice: the
instrument sub-type is not available, so the ₹18,000 it would resolve cannot be
checked. Reading the payment entity properly killed that. `upi.payer_account_type`
exists and carries exactly the three values the fee analysis turns on.

What it is missing from is the settlement recon report — the artifact a merchant
actually reconciles against, which carries only `method`, and `method` reads
`UPI` for all three rails. Confirmed at the type level rather than by reading
prose: `payer_account_type` appears nowhere in the settlement typings, and is
absent from the official Node SDK's typings altogether, so even the per-payment
join needs a cast around the SDK.

So the ceiling is a **placement** problem, not an availability one: the field
exists, it is not where the decision is made, and moving it there costs one API
call per settled transaction — 960 of them on this cycle. The ask sharpens from
"collect this field" to "put `payer_account_type` on the recon row", which is a
thing a payments company can actually do. The adapter refuses to guess in the
meantime: `instrumentFromReport` returns null for UPI and the cycle carries a
`SourceGap` naming the field, where it was looked for, and how many rows are
affected.

This is the correction I am most glad we made, because the wrong version was
more flattering. "The rail does not collect this" is a bigger-sounding finding
than "the rail collects this and does not show you", and it is false, and any
reviewer who knows the API would have found it in a minute.

### 2. Two invariant checks that could not fail

`tools/invariants/{waterfall,ceiling,cross-cycle}.ts` — 409 lines between them —
were fully implemented, correct, and registered in `checks[]`. `verify-contract.ts`
imported the contract and the fixtures and nothing else, so `checks` was never
read. `pnpm verify:mock` printed a confident `10/10 passed` over a harness that
was testing a third less than it appeared to be. Correct dead code is worse than
absent code: it reports green and it looks like coverage in a diff.

Wiring them in was small. The loop reads `checks` rather than naming its
members, which paid for itself inside the hour — a fourth check, `report`, was
registered by another stream afterwards and ran on the next invocation with no
edit.

Then the second half, which is the part worth reading. A check that has never
failed has never been tested, so each identity was made to fire: a test file run
in process against a fake `fetchJson`, its world built from the real engine output
rather than a hand-written payload, every negative case being that same correct
payload with **exactly one field moved**, and every assertion checking that the
check named the right failure and returned exactly one problem. `waterfall`
failed immediately, and not on an identity — its `run()` awaited `fetchJson`
outside any `try`, so an unreachable API made the check **reject** instead of
report. `waterfall` is the first invariant row in the table. On a deploy that is
down, the check that fires first is the one that would have taken the whole
table down with it instead of printing one red row.

The fix was the smallest one available: wrap the body in `try`/`catch` and
return a problem string, using the same `describe(e)` idiom already written
twice in the sibling files. Nothing was weakened — no identity relaxed, no
threshold moved, no expected rupee constant added. The change strictly adds a
reported failure mode.

`pnpm verify` now reads 14/14 against the real API — every contract endpoint,
plus four invariants checked over the wire.

### 3. "The sum of the fee lines" is not one instruction

Four reviewers took one downstream stream's seat each and tried to build against
the frozen types before the freeze. The one that mattered was a line of English
in the policy: `tax_on_fees`, "applied to the sum of fee lines".

That reads unambiguous. It is not. Taxing the gateway fee alone gives ₹4,320.
Taxing every fee line — the failed-payment charges, the chargeback fees, the
on-demand settlement fee — gives ₹5,094. The canonical figure is the former.
Two implementers would have shipped numbers ₹774 apart, each satisfying the
sentence they were given, each passing their own tests, and neither able to tell
from the output which reading the other had used.

The policy line now names `taxableLineIds` explicitly, so the set is data the
test can assert on rather than a phrase two people have to read the same way.
The general rule I took from it: in a document that computes money, a noun
phrase describing a set of things is a bug until it is a list of ids.

The same review turned up four more real holes in types written an hour earlier
— among them `Backtest.medianAbsError` being a required number, which forced a
forecast with zero backtested cycles to report zero error, precisely what
contract invariant 10 forbids. It also produced its own lesson: an adversarial
verify pass refuted all forty findings, because the refuter had been told to
default to refuted when uncertain. A verification pass that cannot fail is not
verification. The blockers were checked by hand instead.

### 4. Four lines that would have made the demo greener, not written

`SettlementSummary` carries a `windowStatus`. Deriving it inside the list route
is four lines — `settledAt + 3 days`, compare to a threshold — and it would have
kept `/v1/settlements` and `/v1/settlements/:id` serving while `engine/window.ts`
was still a stub.

It was not done, and the cost was real and visible for most of a stream: both
endpoints returned 500 for no reason of their own, and `pnpm verify` against the
real API read 7 of 13 rows green rather than the 9 or 10 a local derivation
would have bought. That is an uncomfortable number to leave on screen.

The reason to leave it is that two implementations of the three-day rule agree
on Meera and diverge on the first cycle whose deadline lands near the closing
threshold — and both look internally consistent while they disagree. A merchant
sees a countdown, not a code path. A transitional 500 saying *this is not
implemented yet* is a better artifact than a permanent second rule bought to
make a two-hour window look greener. `buildDisputeWindow` landed mid-stream and
both endpoints came up with no change at all; the four lines would now be dead
weight nobody would ever delete.

It is the same rule the API applies at its most consequential point. If the
waterfall does not sum to the credited amount, `/explanation` returns 409 and no
payload — not the lines with the reconciliation block quietly dropped. A
merchant who disputes on the strength of a waterfall that does not close has
spent her one three-day window on a number we could not stand behind.

---

## Where it stands

Measured, not recalled:

```
pnpm typecheck                clean
pnpm test                     15/15 contract · 97/97 engine
pnpm test:golden              6/6
pnpm verify:mock              14/14
BASE=<local api> pnpm verify  14/14   against the real API on the synthetic source
```

`calculate(MEERA_CYCLE, COMMITTED_POLICY)` deep-equals the frozen explanation
fixture, `analyseCeiling` of that deep-equals the frozen ceiling, and the served
`/explanation`, `/ceiling` and `/policy` deep-equal the fixtures over HTTP.
Reconciliation delta is 0. The three missing fields sum to ₹24,000 by partition,
not because three numbers were typed in. The cross-cycle check pages the list and
re-derives both ceiling axes over every generated cycle, which no single-fixture
mock can assert.

## What I would do next

**The live policy parser.** What ships is the committed, human-approved policy
with citations — which is the documented fallback, not an accident, and the
human approval is a hard precondition either way. But `/ops/policy/parse`, the
call that turns a rate card or a T&C into that policy, was not built and the
Anthropic SDK is not installed. It is the piece that makes the product work on a
merchant whose plan I have never seen.

**One real Razorpay response.** The spike made zero API calls — there were never
any test keys — so every field list in `docs/razorpay-shapes.json` is marked
`observed: false` and came from the published docs. The live driver compiles and
reaches the API and has never seen a real settlement. `pnpm spike:razorpay` fills
the file in the moment keys exist, and the first real response supersedes every
documented field in it.

**Deployment.** `render.yaml` is committed and both services build. The Blueprint
was never created, so there is no URL and nothing is live. Nothing authenticates
either — `TOKEN` is threaded through the verifier because the contract's error
enum has an `unauthorized` code, but no route reads the header today.

**Persisting a cycle.** Everything is computed per request and memoised in
process. A merchant cannot come back to last month's explanation, annotate a
line, or show it to anyone. The explanation and the ceiling are pure functions
of a cycle and a policy, so they are safe to store; the window, the report and
the forecast move with the clock and must never be.

**A cycle that is still open.** Every synthetic cycle is sealed, so
`/v1/forecast/current` always falls back to the most recently settled one and
serves an `expectedSettlementAt` that is earlier than its own `asOf`. The
forecast is a faithful replay of the past. The fix is a generator that emits an
open cycle; the route picks it up with no change.
