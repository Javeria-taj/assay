# ADR-0002 — Reconciling and verifying are separate axes, and verifiability is derived

**Status:** Accepted, 5 September 2026. Encoded in the frozen contract
(`API_CONTRACT.md` §"The two ideas the schema encodes", invariants 6, 7, 8).

---

## Context

The natural design gives each waterfall line one boolean: *explained*, or not.
Meera's gateway fee breaks it. The ₹24,000 is arithmetically exact — it
reconciles to the paisa against the rail's own credited figure — and she has no
way whatsoever to check the rule that produced it, because it spans five rails
carrying different statutory network MDR and three of them reach her report
labelled identically as `UPI`.

One boolean has to call that line either *explained* or *a discrepancy*. Called
explained, the product's entire finding disappears. Called a discrepancy, the
product is accusing a gateway of a fee that is correct — which is both wrong and
the one posture Assay must never take.

The two questions are simply different questions, and the interesting number
falls out of asking the second one of the whole ₹71,082 delta rather than only
of the part that looks suspicious.

## Decision

**Two independent booleans per line, and two independent partitions of the same
delta.** They are never collapsed, and neither is ever presented as a subset of
the other.

*Does the amount add up?* `seal()` in `domain/lines.ts` computes every running
balance and throws `ReconcileError` — contract code `reconciliation_failed` —
when the signed lines do not reach `cycle.statedNetPaise`. A returned
`Explanation` therefore always carries `reconciliation.delta === 0`; the
non-zero case is a refusal, not a payload. Assay will not render a number that
does not add up.

*Can the merchant check the basis?* `verifiability()` in `engine/calculate.ts`
is the only place in the calculator stream that decides. It reads `GAP_EXPOSURE`
— which line kinds lean on which declared source gap — and looks that gap up in
`cycle.gaps`. **`basisVerifiable` is derived, never assigned.** Nobody hardcodes
`false` on the gateway-fee line. Hardcoding it would make the ceiling an
assertion about this fixture rather than a measurement of any cycle: a source
that *did* return `payer_account_type` would still be reported unverifiable. As
written, the ceiling falls out of what the rail could not answer, and if the
rail starts answering, the number moves on its own and nobody edits a
percentage.

`analyseCeiling()` in `engine/ceiling.ts` then partitions the same
`totalDelta = grossCaptured − netCredited` twice. Both axes sum the *false* side
and take the complement, rather than computing both halves independently — two
`share()` calls landing on a 4dp boundary both round up and the pair sums to
1.0001, failing invariant 7 on a generated cycle that Meera's numbers happen to
dodge. `missingFields` is a partition of the instrument mix by
`attributionOf(slice)` in `domain/attribution.ts`, keyed on `reportedAs` — the
label the *merchant* sees — so the three fields sum to the gateway fee by
construction rather than by three hardcoded numbers that happen to add up.
`assertCeilingIsSound()` proves invariants 7 and 8 before the value is returned.

On the canonical cycle: total delta 71,08,200p, reconciliation delta 0,
`basisUnverifiable` 24,00,000p at share 0.3376, `basisVerifiable` 47,08,200p at
0.6624, and the three missing fields resolving 18,00,000p, 4,80,000p and
1,20,000p — 24,00,000p exactly.

## Consequences

**A source that under-reports its own gaps under-reports the ceiling, and Assay
cannot tell the difference.** `buildGaps()` in `sources/synthetic.ts` emits the
`instrument_sub_type` gap only when a slice attributes to `instrument_subtype`.
An adapter that returned nothing useful and declared no gaps would produce a
cycle where every line is `basisVerifiable: true` and the ceiling reads 0%
unverifiable — indistinguishable, from inside the engine, from a rail that
answers everything. The measurement is only ever as honest as the adapter's own
self-report, and nothing in the codebase audits that self-report. The live
driver is written to that discipline (`sources/live.ts` refuses to infer a UPI
sub-type and records the gap with its `affectedCount`), but discipline is what
holds it, not a type.

**Every new gap is a code change, not data.** `GAP_EXPOSURE` names one line kind
and one field today. A second gap means editing `calculate.ts` and
`domain/copy.ts`, not writing a row.

**Derived means unoverridable.** An operator who knows a basis is checkable has
no way to say so; the only lever is the source's gap list.

**The two axes cost explanation.** "Every rupee reconciles, and a third of it
cannot be checked" is a sentence that has to be taught before it lands — which
is why the headline and `CEILING_METHOD` in `domain/copy.ts` are part of the
payload rather than left to the UI to phrase.
