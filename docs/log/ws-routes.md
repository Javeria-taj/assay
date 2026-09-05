# WS-5 · routes, config, and the verify wiring

Nine endpoints were defined in the frozen contract. One was served. The engine
behind the other eight had been green for hours and no HTTP client could reach
it. This stream is the wiring, and one real defect found in the harness that was
supposed to be watching all of it.

## What was built

| File | What it is |
|---|---|
| `apps/api/src/config.ts` | Everything the process learns from its environment, read once |
| `apps/api/src/engine-computed.ts` | The engine assembled over a `SettlementSource` |
| `apps/api/src/routes/answer.ts` | The one place an engine outcome becomes an HTTP status |
| `apps/api/src/routes/health.ts` | `GET /v1/health` |
| `apps/api/src/routes/settlements.ts` | The five settlement routes, with cursor paging |
| `apps/api/src/routes/forecast.ts` | `GET /v1/forecast/current` |
| `apps/api/src/routes/policy.ts` | `GET /v1/policy` |
| `apps/api/src/routes/index.ts` | Mounts all nine, and proves it against the contract |
| `apps/api/src/server.ts` (edit) | Assembly only — no env, no arithmetic, no envelope |
| `tools/verify-contract.ts` (edit) | Runs the three wire invariants that had never run |

`envelope.ts` was not touched. It already owned the envelope, the requestId, the
`x-assay-*` headers, the 405 and the 404, and CORS still sits outside it so that
refusals keep their CORS headers. That ordering was verified rather than
assumed — a 404 and a 405 both come back carrying
`access-control-allow-origin`.

## The defect: three correct checks that had never run

`tools/invariants/{waterfall,ceiling,cross-cycle}.ts` — 409 lines between them —
were fully implemented and registered in `checks[]`. `tools/verify-contract.ts`
imported the contract and the fixtures and nothing else, so `checks` was never
read. Every one of them was correct dead code, and `pnpm verify:mock` printed a
confident `10/10 passed` over a harness that was testing a third less than it
appeared to be.

They are now run after the per-endpoint checks, in the same table, so the run
still ends in one `N/N passed` line:

```
  ok    invariants        explanation
  ok    waterfall         (invariant, over the wire)                          1ms
  ok    ceiling           (invariant, over the wire)                          2ms
  ok    cross-cycle       (invariant, over the wire)                          2ms
  ok    report            (invariant, over the wire)                          2ms

14/14 passed
```

The loop reads `checks` rather than naming its members, which paid for itself
inside the hour: a fourth check, `report`, was registered by another stream
after this wiring landed and ran on the next invocation with no edit here.

`run` is contracted never to throw. The call is wrapped anyway: a harness that
trusts that contract loses the whole table to one bad check, and the failure
would read as a crash rather than as a named check failing.

The payoff is not the three extra rows against the mock, which ships one
settlement. It is `cross-cycle` against the real API, where it pages the list
and re-derives both ceiling axes over **all six generated settlements** — a
check no fixture can pass by being served correctly.

## Three decisions worth the words

### The clock is a parameter, never a call

`config.now()` is the only clock in the process below the framework. A route
reads it **once** at the top of the handler and hands that single number down.

This is not tidiness. `GET /v1/settlements` builds each summary's
`windowStatus` from the same dispute window `GET /v1/settlements/:id/window`
serves. A handler that called `now()` twice could serve a list saying `closing`
beside a window whose `msRemaining` says otherwise — a one-millisecond
disagreement that reproduces about once a day and never in a test. Passing the
number makes it unrepresentable.

It is also what makes the memo safe. The explanation and the ceiling are pure
functions of a cycle and a policy, so they are cached; the window, the report
and the forecast move with the clock, so they never are. The rule is mechanical:
if `now` is a parameter, there is no cell.

### `summary.windowStatus` calls `buildDisputeWindow`, and paid for it

`SettlementSummary` carries a `windowStatus`. Deriving it here — `settledAt +
3 days`, compare to a threshold — is four lines, and it would have kept
`/v1/settlements` serving while `engine/window.ts` was still a stub.

It was not done, and the cost was real and visible: for most of this stream,
`/v1/settlements` and `/v1/settlements/:id` returned 500 for no reason of their
own, and `BASE=… pnpm verify` read **7/13** against the real API rather than
the 9 or 10 a local derivation would have bought.

The reason is the one `apps/api/src/domain/README.md` gives. Two
implementations of the three-day rule agree on Meera and diverge on the first
cycle whose deadline lands near the closing threshold — and both look
internally consistent while they disagree. A transitional 500 saying *this is
not implemented yet* is a better artifact than a permanent second rule bought
to make a two-hour window look greener. WS-4 landed `buildDisputeWindow`
mid-stream and both endpoints came up with no change here; the four lines would
now be dead weight nobody would ever delete.

### The contract's `endpoints` object is checked, not trusted

`routes/index.ts` holds a `SERVED` set and compares it to
`Object.keys(endpoints)` at startup. Adding an endpoint to the contract and
forgetting to mount it otherwise produces a 404 indistinguishable from a
mistyped URL, and the only thing that notices is a conformance run nobody has
started. Here it is a process that will not boot, naming the endpoint.

The startup banner prints the served paths from the contract itself, so it
cannot drift from what is mounted the way a hand-maintained list does.

## Refusals

`routes/answer.ts` maps three outcomes and rethrows everything else:

| Thrown | Status | Code |
|---|---|---|
| `ReconcileError` | 409 | `reconciliation_failed` |
| `PolicyNotApprovedError` | 409 | `policy_not_approved` (field `policy.lines.<id>`) |
| `null` returned | 404 | `not_found` |
| anything else | 500 | `internal` |

The tempting handling of a `ReconcileError` — log it, drop the reconciliation
block, serve the lines anyway — is the worst thing this product could do. A
merchant who disputes on the strength of a waterfall that does not close has
spent her one three-day window on a number we could not stand behind. So no
payload is served at all, and the 409 carries both figures.

All four were exercised directly, not reasoned about.

## Paging

The cursor is the id of the last item on the previous page: opaque to the
client, stable under a source that grows at the front. An offset would silently
skip a settlement the moment a newer cycle landed between two requests.

A cursor naming an unknown id is a **400**, not an empty page. Returning
`{ items: [], nextCursor: null }` there tells a paging client it has reached the
end when it has in fact lost its place.

`limit` is validated before the source is touched, so a bad request costs
nothing to refuse.

## Verified, not claimed

```
pnpm typecheck    clean, exit 0
pnpm test         15/15 contract · 88/88 api        exit 0
pnpm test:golden  6/6                               exit 0
pnpm verify:mock  14/14   (was 10/10 with three checks dead)
```

And against the **real API** on the synthetic source, which is the number that
matters here:

```
BASE=http://localhost:4321 pnpm verify   ·   14/14 passed
```

All nine contract endpoints, plus all four wire invariants. `cross-cycle` alone
re-derives both ceiling axes across all six generated settlements — an
assertion the fixture mock cannot make, because it ships one settlement.

Also checked by hand against the running server:

- the served `/explanation`, `/ceiling` and `/policy` for `stl_2608mera01`
  **deep-equal** `F.EXPLANATION`, `F.CEILING` and `F.POLICY`;
- all six generated settlements explain and produce a ceiling over HTTP;
- `/v1/settlements` lists six with real per-cycle `windowStatus` and
  `basisUnverifiableShare`, warm in ~1 ms;
- CORS headers survive a 404 and a 405;
- `grep -rn "as any\|@ts-expect-error" apps/api/src --include='*.ts'` is empty;
- `/v1/settlements` paging was walked end to end at `limit=3` over a stub
  source — 3 pages, 7 items, no repeats and no gaps — because the real source
  ships six settlements and one page swallows them all.

## Left for whoever picks this up

- `apps/api/src/engine/ports.ts` is still the superseded stub layer. PATHS §3
  says WS-5 reconciles it *later*; it is not in this wave's file set and was not
  touched.
- `/v1/forecast/current` asks the source for a cycle with `status: "pending"`
  and falls back to the most recently settled one. **Every synthetic cycle is
  sealed**, so today it always takes the fallback, and the served payload shows
  it: `expectedSettlementAt` (1788413400000) is *before* `asOf`
  (1788582350097), because the cycle being "projected" landed two days ago.
  Nothing here is wrong — the forecast is a faithful replay — but it is a
  forecast of the past, and no amount of route code fixes that. The fix is a
  generator that emits an open cycle; the route picks it up with no change.
- Nothing authenticates. `TOKEN` is threaded through the verifier because the
  contract's error enum has an `unauthorized` code, but no route reads an
  `authorization` header today.
