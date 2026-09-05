# WS-2 · synthetic generator — build log

What broke, what surprised me, and what turned out to be a non-event. Numbers
and assertions named, because a log entry without one is a feeling.

---

## The band the brief gave me for refunds cannot be drawn from safely

This is the one real bug I designed out rather than debugged out.

The sorted-zip is the right idea: sort the refund parts descending, sort the
payments descending by amount, and pair them. If the largest part fits the
largest payment then every other pair fits, so "refund exceeds the payment it
refunds" stops being a rare case to handle and becomes impossible.

But the zip only saves you if the largest part *can* fit. The brief's bands are
refund count in `[0.02, 0.06] × payments` and refund value in `[1.5%, 4%]` of
gross. Take the corners: 4% of gross split across 2% of the payments gives a
mean refund of **2× the mean ticket**, and `partition`'s ±40% jitter pushes the
largest part to ~2.8× the mean ticket. The largest payment, meanwhile, is about
1.4× the *fattest slice's* mean ticket. On a cycle whose rails all have similar
baskets, 2.8 > 1.4 and the generator throws — not on a bad seed, on a
legitimate draw from the stated band.

So the drawn seeds use a sub-interval of the brief's band: count in
`[4.0%, 6.0%]` of payments, value in `[1.50%, 2.50%]` of gross. That caps the
mean refund at 0.625× the mean ticket and the largest part at ~0.875×, which is
below the *guaranteed minimum* largest payment — `partition` always emits at
least one part of `ceil(target / n)`, so the biggest payment is never smaller
than the fattest slice's base ticket, which is itself never below the cycle's
overall mean ticket. The inequality holds by construction rather than by luck.
The canonical spec is a literal and sits inside the safe region anyway: 41
refunds worth ₹32,000 against 960 payments worth ₹12,00,000 is a mean refund of
0.62× the mean ticket.

`generate` still throws, naming both numbers, if the zip ever fails. It has not.

## The same trap, one layer down, for disputes

A dispute needs a host payment at least as large as its principal, and the
principal is fixed in the spec *before* any payment exists. Drawing it from the
brief's `[₹500, ₹5,000]` band against a cycle whose mean ticket may be ₹300
would leave nothing eligible to host it.

`partition` gives the way out: with the rng on, every part is at least
`base - floor(base × 0.4)`, i.e. 60% of that slice's base ticket. Cap the
principal at 60% of the fattest slice's base and *every* payment in that slice
is eligible, so four disputes always find four hosts. When even that cap falls
below the band's ₹500 floor, the cycle simply has no disputes. `meera-2026-04`
is that case — its fattest base ticket is ₹637.10, so the cap lands at ₹382.26
and nothing in the month is large enough to host a ₹500 dispute. It reports zero
disputes rather than a shrunken principal, which is the honest answer.
(`meera-2026-03` also has zero, but only because it drew zero from `[0, 4]`; its
cap was ₹1,951.68 and it could have hosted four.)

## `statedNetOf` as a second implementation: it agreed, first time

The brief asks for an honest sentence on whether the deliberate duplication
caught anything. It did not. `statedNetOf(specFor("meera-2026-08"),
COMMITTED_POLICY)` returned `112891800` on the first run, matching
`MEERA_CYCLE.statedNetPaise` and the fixture's `F.NET_CREDITED`, and
`calculate(generate(CANONICAL_SEED))` deep-equalled `calculate(MEERA_CYCLE)`
without an intermediate wrong answer.

That is worth writing down precisely because it is the boring outcome. The
value of the duplication is not that it caught a bug tonight; it is that
`reconciliation.delta === 0` across six cycles is now an assertion about two
independently written arithmetic paths agreeing, rather than the calculator
checking its own working. Had I derived `statedNetPaise` from the engine, all
six deltas would still be zero and none of them would mean anything.

## `checkCycle(cycle)` needs the spec, and its signature does not have one

Six of the eleven invariants are "the events add back up to what the seed asked
for" — payments sum to the slice targets, refunds sum to `refundTotalPaise`,
`settlement.settledAt` is the spec's. None of those is recoverable from a
`RawCycle` alone: derive the slice totals from the payments and the check
becomes `x === x`.

The signature is the one a downstream caller actually has, so I kept it and put
a `WeakMap<RawCycle, CycleSpec>` behind `generate`. It holds no rng, it does not
change what `generate` returns, and `deepStrictEqual(generate(s), generate(s))`
still passes for all six seeds. A cycle that did not come from `generate` gets
the five structure-only invariants and no false pass.

## Two of the five drawn cycles carry no source gap

`meera-2026-06` (card_credit, card_debit, netbanking) and `meera-2026-05`
(card_credit, card_debit, wallet) drew no UPI rail, so `buildGaps` emits `[]`:
with one rail per report label, the merchant *can* attribute the fee, and
declaring a gap there would be a fabrication.

Flagging it rather than fixing it, because the fix is not mine. `Ceiling`
requires `missingFields` to have at least one entry, and if WS-3 derives that
list from `cycle.gaps` instead of from the instrument mix, those two seeds will
fail schema validation the moment a ceiling is computed for them. Deriving it
from `attributionOf` over the slices — which is what PATHS §5.1 says to do —
keeps `card_bin_tier` and `per_line_fee_basis` present with `wouldResolve: 0`,
and the problem does not arise. Today `Explanation.parse` succeeds and
`checkWaterfall` returns `[]` for all six.

## Two small ones

`intBetween(rng, Math.ceil(0.04 × n), Math.floor(0.06 × n))` throws when
`hi < lo`, which happens for any cycle under ~25 payments — the floor rounds the
upper bound below the ceiling of the lower. Moved both bounds into integer
per-mille arithmetic with a floor of one refund, so a small month draws one
refund instead of crashing.

And the acceptance grep for `Math.random\|Date.now()\|new Date()` matched my own
doc comment promising that the file uses none of them. A grep does not read
prose. Reworded, and the criterion now returns nothing for the right reason.
