# WS-3 — ceiling analyser and the cross-cycle harness

Written in the moment. Never rewritten from memory, never reflowed.

---

### 17:52 — the ₹15,600 answer is what a correct-looking filter produces

Expected the zero-MDR filter to be uninteresting: sum the slices carrying no
network MDR. Wrote it against `isStatutoryZeroMdr` anyway because PATHS said to,
then went back and proved the alternative was actually wrong rather than merely
discouraged — swapped in `s.networkMdrBps === 0` and reran. `CEILING 26/32`:
assertions 21, 22, 23, 24, 25 and 31 all fell over, because netbanking carries a
zero network MDR too and is not statutory zero-MDR — it is a flat
per-transaction bank charge, not an ad-valorem one. The numeric filter returns
₹15,600 where the fixture says ₹14,400.

The judgement: the fixture's own note already says why, in its last sentence,
and the ceiling renders that note from a template. So the wrong filter would
have produced a number that contradicts the sentence printed next to it. That is
worth more than an assertion — assertion 24 now names the trap in its failure
message so the next person reads *why* rather than *what*.

---

### 18:10 — the two-`share()` tie is real, and the fixture cannot show it

Expected to take the "derive the complement" rule on faith. Instead constructed
the boundary case to check the trap exists at all: 10001p unverifiable out of a
20000p delta. `10001/20000 × 10000 = 5000.5` and `9999/20000 × 10000 = 4999.5`.
`Math.round` takes both halves *up*, so two independent `share()` calls give
0.5001 + 0.5000 = **1.0001** — outside the frozen `Share` bound and a straight
failure of invariant 7. Deriving the complement gives 0.5001 + 0.4999 = 1.0000.

Meera's split (0.3376 / 0.6624) lands nowhere near a boundary, so the fixture
can never distinguish the two implementations. Assertion 32 therefore asserts
the overshoot *does* reproduce under two `share()` calls, alongside asserting
that `analyseCeiling` avoids it. Negative control: reverting the derivation to a
second `share()` call gives `CEILING 31/32`, failing only 32. A test that cannot
fail is not a test, and 1–31 could not have failed here.

---

### 18:34 — `Math.abs()` passes 32/32, and that is the interesting part

Expected the negation-versus-`Math.abs` rule to be caught by the fixture like
the other two traps. Swapped `-l.amount` for `Math.abs(l.amount)` and reran:
`CEILING 32/32`. Every bucketable line in Meera is a deduction, so the two are
identical on her, and no amount of assertions against the frozen fixture will
ever separate them.

The judgement: do not add a 33rd assertion to `ceiling.test.ts` inventing a
positive adjustment — that would be a second fixture. Push the coverage into
`cross-cycle.test.ts` instead, where an adversarial `Explanation` carries a
positive `adjustment` line flagged unverifiable and the harness re-derives the
false-side sum with **its own** negation, in a different file. Two
implementations disagreeing is the assertion; one implementation restating
itself is not. This is the only trap of the three that the golden fixture is
structurally incapable of catching, and it is worth knowing which ones those
are.

---

### 18:58 — a rounding residual that would have cost one paisa, in the wrong direction

The brief distributes `unverifiableFromGatewayFee` across the three ids pro rata
and applies "any pro-rata residual to `per_line_fee_basis`". Rounding each group
independently and then correcting the last one is exact in total, but the
correction can be negative — and a group rounded to 0 that then takes a −1p
correction goes negative, gets dropped by the `wouldResolve > 0` filter, and
invariant 8 fails by a paisa on a cycle nobody has generated yet.

Allocated on the *running* total instead: each group takes
`round(total × cumulativeFee / totalFee)` minus what is already allocated. That
is monotone, so no group can be negative, and the last group absorbs the
residual by construction — which is `per_line_fee_basis`, exactly where the
brief puts it, without a second rounding rule to keep in sync. For Meera the
slice fees already sum to the gateway fee, so every group takes its own sum
unchanged and the fixture is untouched.

---

### 19:41 — the harness found an input where refusing is the right answer

Built adversarial `Explanation`s and ran the ceiling identities over them. Two
of the five generated cycles failed: `analyseCeiling: basisVerifiable is
7883398p, outside [0, 7783398]`. Cause: on `assay-2025-11` the mix carries no
collapsed UPI slice, so WS-1 flags *nothing* unverifiable; adding a positive
adjustment that is unverifiable then makes `basisUnverifiable` negative, because
a positive line contributes a negative amount by design.

Nearly weakened the guard. Did not, because the contract's `Share` is bounded
`0..1` and a negative bucket cannot be represented at all — the engine must
refuse rather than serve a number the schema will reject at the route boundary.
So the guard firing *is* the specified behaviour, and the harness was asserting
the opposite of the brief.

Two changes fell out. `analyseCeiling` now clamps the gateway-fee share of the
unverifiable total into `[0, basisUnverifiable]` so the partition stays
non-negative and still sums exactly. And the harness distinguishes "an identity
broke" from "the guard correctly refused", counts both, and prints the
refusals — plus a calibrated adjustment case, strictly inside the existing
unverifiable total, where the identities *must* hold. Without that second case
the `Math.abs` coverage would have been silently lost to the refusal.

---

### 20:22 — WS-2 shipped a different export, and a seed format I had to obey

Picked `generateCycles(seeds)` at 20:15 as the brief instructs. WS-2 had already
landed `generate(seed)` and `historicalCycles()`. The brief is explicit that this
side adapts, so the loader probes all three names in the order they were
proposed and takes the first that yields shape-checked `RawCycle`s.

Then the harness silently fell back to `historicalCycles()`, which was the wrong
kind of green: `generate("assay-c1")` throws, because the generator requires
`<name>-YYYY-MM`. Rewrote this file's committed seeds as five months
(`assay-2025-11` … `assay-2025-07`) that do not appear in the generator's own
corpus. That matters: a generator scored only against its author's chosen seeds
is marking its own homework, and the shape-check on the returned cycles is there
so a generator returning junk falls back rather than passing.

---

### 20:47 — `independentNet` never disagreed, and the reason is not luck

Expected the divergence the brief warned about: `independentNet` applies P-01
per instrument slice, WS-2's `statedNetOf` applies it on the cycle aggregate, and
those two round differently. Across `MEERA_CYCLE` and five generated cycles the
answer agreed to the paise every time, and `calculate()` agreed with both.

Checked *why* rather than banking it. Every slice gross in this corpus is a whole
number of rupees, and 200 bps of a whole-rupee amount is `gross / 50` — exact, no
rounding at all — so the two aggregation levels are identically equal, not
approximately equal. The identity holds by construction of the spec, not by luck
of rounding.

Recording this because it is a limit of the harness, not a win: the per-slice
versus cycle-aggregate distinction is currently **untested**, and would only bite
at a rate whose bps division is inexact, or at slice totals carrying paise. If a
future plan rate is not a multiple of 50 bps, this is the first thing that
diverges, and three implementations agreeing today says nothing about that case.

---

### 21:05 — weakening the "tested nothing" rule, deliberately

`tools/invariants/cross-cycle.ts` is required to say so rather than pass
silently when `/v1/settlements` returns exactly one item. Implemented literally,
it turns `pnpm verify:mock` red: the fixture mock ships exactly one settlement by
design, and a check that is red in its documented healthy state gets ignored
within a day.

Narrowed it instead: a single-item list is only reported when `/v1/health` says
the source is not `mock`. On the fixture mock, one settlement is the correct
state; on anything else, a list of one means this check covered nothing the
`ceiling` check did not, and it says so. Verified both halves against a local
server serving mutated payloads — nine deliberate breakages, all nine caught,
including the two that only `cross-cycle` sees (a live deploy listing one
settlement, and a second settlement whose ceiling is wrong).
