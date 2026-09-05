# WS-4 — window, report, forecast

Three payloads, three files, one gate: deep equality against what is already
shipped. `packages/contract/src/fixtures.ts` is the typed reference and
`tools/fixtures.generated.json` is what the mock actually serves, so both are
asserted — a fixture edited but never regenerated fails here rather than at the
demo.

Files:

| File | What it is |
|---|---|
| `apps/api/src/engine/window.ts` | `buildDisputeWindow(settledAt, now, settlementId)` |
| `apps/api/src/engine/report.ts` | `buildReport(explanation, window, generatedAt)` |
| `apps/api/src/engine/forecast.ts` | `forecastOpenCycle(cycle, policy, asOf)` |
| `apps/api/test/window-report-forecast.test.ts` | 23 tests |
| `tools/invariants/report.ts` | the `report` check, over the wire |
| `tools/invariants/index.ts` | one line: `reportCheck` registered |

Signatures unchanged. Nothing under `packages/contract/**` or
`apps/api/src/domain/**` was touched, and `pnpm fixtures:check` is clean, so the
generated JSON is byte-for-byte what it was.

---

## The window

Three fields decide whether a merchant still has a contractual right, so all
three are server-computed and none is guessed:

- `deadlineAt = settledAt + DISPUTE_WINDOW_MS`, imported from `@assay/contract`
  rather than retyped. A second definition of "three days" is a second place for
  the deadline to be wrong, and a deadline wrong by an hour is worse than one
  that is absent.
- `clause` is `CITATIONS.threeDayClause` — the object, not a copy of it. The
  test asserts reference equality on purpose: a reconstructed citation
  deep-equals right up until somebody fixes a typo in one of the two copies.
- The status flips **at** the boundary, not after it. At exactly
  `closingThresholdMs` remaining it already reads `closing`; at exactly 0 it
  already reads `expired`. Both boundaries are asserted, in both directions.

## The report

The letter is **assembled**, never written. Every figure in the body comes off
the `Explanation` it was handed, and the strongest test in the file builds the
report twice — once from the fixture, once from `calculate(MEERA_CYCLE,
COMMITTED_POLICY)` — and requires the two to be identical. That is what proves
it is made of reconciled lines rather than of the fixture it happens to match.

Three decisions worth recording.

**The claim set is derived, not enumerated.** `merchantExpected` is gross, less
the headline rate, less refunds — so `gross_captured`, `gateway_fee`,
`refund_principal` and the `net_credited` marker are the lines she has already
accounted for, and *every other deduction* is by construction a line that
explains the difference. Naming the five kinds instead would silently drop a
sixth kind of charge out of a future letter.

**The gateway fee is never claimed.** It reconciles; she simply cannot check its
composition. It appears in the closing paragraph explicitly flagged "not
disputed here", because the product measures and does not accuse. That paragraph
is derived too: the amount is the sum of the lines the engine itself marked
unverifiable, and the "three of which are reported identically as UPI" clause is
counted off `reportedAs`. A cycle with nothing unverifiable emits no such
paragraph at all.

**The body is wrapped, not laid out by hand.** Paragraphs are composed as
sentences and greedily wrapped at a 77-character measure; claim rows put their
amount in column 43, widening only if a statement would collide with it. The
letter gets pasted into an email client, so it is wrapped once here rather than
left to whatever renders it.

Claim statements are built from each line's own label and numbers — the
parenthetical is lifted (`Chargebacks (principal)` → `Chargebacks, 2 × ₹2,700
principal`) and `count × unitAmount` is appended where the line carries them.
One override: the tax line's waterfall label reads "on the fee" because on
screen it sits directly beneath the fee it is levied on, and a letter read on
its own has no such neighbour, so the base is named. The substitution is
anchored to the end of the label and falls through untouched when there is no
fee line to name.

`disputedTotal` is the sum of the claims, not a separately computed figure. For
Meera it equals `unexplainedGap` to the paisa; when a plan's headline rate ever
differs from its applied rate the two part company, and the letter then says how
much the listed lines *do* account for rather than overclaiming.

## The forecast

Same engine, run forward — meant literally. Every rupee goes through the same
`policy-apply.ts` helpers at the same levels of aggregation: P-01 per instrument
slice, P-02 once on the summed fee, P-03/P-04 as integer count × approved fixed
amount, P-05 read off the rail. A projection that computed the fee as one
`bps()` call on the aggregate would show a gap that only the rounding created.

Three things separate a projection from a settlement, and all three are in the
payload rather than in a comment: `amountReconciled` is false on every line
(nothing has settled, so there is no rail figure to reconcile against),
`onMerchantReport` is false on every line (the report does not exist yet), and a
component line is emitted only when the cycle has actually incurred it — no
disputes means no chargeback lines, not chargeback lines reading zero.

**Contract invariant 10 holds by not being clever.** `backtest.cycles` is 0
because this function replays nothing, and the note says so in the words the
shipped fixture already carries. `historicalCycles()` exists and was
deliberately left unwired: a half-wired replay reporting a fabricated error
figure is strictly worse than an honest "accuracy not yet measured".

## `tools/invariants/report.ts`

Registered in `checks[]`; green in `pnpm verify:mock` (14/14). It checks what a
wrong deploy would actually break:

- `deadlineAt === settledAt + 3 days`, with the 3 **transcribed from the clause
  text**, not imported from the engine — an invariant that imported
  `DISPUTE_WINDOW_MS` would pass for whatever that constant happened to hold.
  The number is then read back a second time out of the served quote itself.
- `msRemaining === deadlineAt − serverNow`, and the status re-derived from the
  threshold the same response declared.
- every claim resolves to a real explanation line **carrying that exact amount**
  — the check a report served from a cache older than the explanation fails, and
  nothing else does.
- `disputedTotal` equals the sum of the claims, and every claim statement
  actually appears in the body it summarises, since that is the cross-link the
  UI draws.

Nine tests drive it in-process off a fake `fetchJson`, one mutation at a time.
Mutations are relative (`+= 1`, a suffix on an id), so nothing in the test file
can drift into being a third fixture.

## Escalated, not worked around

`calculate.ts` decides `basisVerifiable` from `cycle.gaps` through a private
`verifiability()` and a private `GAP_EXPOSURE`, neither exported.
`forecast.ts` needs the same rule and may not edit `calculate.ts`, so its
one-entry `GAP_EXPOSURE` mirrors it, with the duplication called out in a
comment at the site. **The right fix is one exported rule both files call.**
Until then the two are pinned together by the forecast deep-equal, so a drift
fails a test rather than shipping.

Also flagged: `NOT_YET_BACKTESTED_NOTE` says the synthetic generator "has not
been run against this policy". It has been, in the generator tests — the
sentence is stale even though the load-bearing half (no replay runs here, so the
zeroes mean *unmeasured*) is true. Held verbatim because it is what the shipped
fixture, the mock and the UI all render; it should be rewritten with the
fixture, in one change, when a real backtest is wired.

## Verified, not claimed

```
pnpm typecheck    exit 0
pnpm test         @assay/contract 15/15 · apps/api 97/97 (23 of them this stream)
pnpm test:golden  6/6
pnpm verify:mock  14/14  (report invariant included)
pnpm fixtures:check exit 0 — generated JSON unchanged
grep -rn "as any\|@ts-expect-error" apps/api/src   → no code hits
```
