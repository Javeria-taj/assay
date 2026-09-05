# WS-6 · proving the invariant checks actually fire

A check that has never failed has never been tested. Three checks were
implemented and about to be wired into `pnpm verify`. Nobody had ever seen one
of them return a problem. This stream made each of them return one.

## What was built

`apps/api/test/invariants.test.ts` — 45 tests, run in-process against a fake
`fetchJson`. No server, no network, no deploy.

The `InvariantContext` interface is the whole seam: each check takes a context
with a `fetchJson(path)` and asks for the same four routes. The test file backs
that with an in-memory world serving `/v1/health`, `/v1/settlements` (paged),
`/v1/settlements/:id/explanation` and `/v1/settlements/:id/ceiling`. The world
is built from `calculate(MEERA_CYCLE, COMMITTED_POLICY)` and
`analyseCeiling(...)` — the real engine, not a hand-written payload — so:

- the **positive** cases are a second, independent statement that the engine's
  output satisfies all three checks, and
- every **negative** case is that same correct payload with **exactly one field
  moved**.

No authored expected rupee figure appears in the file. Mutations are relative
(`+= 1`, `= x + 1`, `= null`), never absolute, so nothing here can quietly
become a third fixture. The only literals are structural: the paisa a number is
moved by, and the ten of `MAX_SETTLEMENTS`.

Each negative asserts three things, not one:

1. the check returned something,
2. it named the **right** failure, and
3. where a single moved field can only break a single identity, it returned
   **exactly one** problem.

Point 3 is what catches a check that fires for the wrong reason — barely better
than not firing at all.

## The finding: `waterfall` was the only check that could crash the run

`tools/invariants/index.ts` states the contract for every check:

> A check returns `[]` for pass, or human-readable problem strings. It never
> throws, never exits, and never prints — `tools/verify-contract.ts` owns the
> table.

`ceiling.ts` and `cross-cycle.ts` each honour that with a `try`/`catch` that
turns an unexpected failure into `"<name>: the check itself failed — …"`.
`waterfall.ts` had no such guard. Its `run()` awaited `ctx.fetchJson(...)`
outside any `try`, so a refused connection, a timeout or a non-JSON body made
the check **reject** rather than report.

Proved before it was fixed — the test failed on the un-patched file with:

```
✖ waterfall · a dead endpoint is reported, not thrown
  AssertionError: the waterfall check threw instead of returning a problem
  string: ECONNREFUSED 127.0.0.1:8787
```

This is exactly the shape of failure that matters most: `waterfall` is the
first invariant row in the table, so on a deploy that is down, the one check
that fires first is the one that would take the table down with it instead of
printing a red row.

### The fix

The smallest change that makes it report rather than crash: wrap the body of
`waterfallCheck.run` in `try`/`catch` and return a problem string, using the
same `describe(e)` idiom already written twice in the sibling files.

Nothing was weakened. No identity was relaxed, no threshold moved, no expected
rupee constant added. The change strictly **adds** a reported failure mode —
before it, that mode was an exception; after it, it is a red row.

That is the only edit made to any `tools/invariants/**` file.

## What was checked, and what fired

### `waterfall` — W1…W5, all five fire

| Mutation | Fires as | Problems |
|---|---|---|
| a line amount off by one paisa | `W1 signed lines do not sum to netCredited` | 1 |
| `reconciliation.delta` set non-zero | `W1 reconciliation.delta is not zero` | 1 |
| `reconciliation.ok` set false | `W1 reconciliation.ok is false` | 1 |
| last line's kind is not `net_credited` | `W2 … not net_credited` | 1 |
| the net marker carries money | `W2 … is a marker and must carry 0` | 1 |
| the net marker's `runningBalance` drifts | `W2 … does not equal netCredited` | 1 |
| a deduction raises the running balance | `W3 … raised the running balance above` | 1 |
| an instrument slice **gross** mutated | `W4 instrumentMix gross does not decompose` | 1 |
| an instrument slice **fee** mutated | `W4 instrumentMix fee does not decompose` | 1 |
| a line cites nothing | `W5 … cites nothing` | 1 |
| an unverifiable line's `unverifiableReason` stripped | `W5 … names no missing field` | 1 |
| a verifiable line carrying a reason | `W5 … yet carries an unverifiable reason` | 1 |
| the endpoint answers a non-Explanation | `not a valid Explanation envelope` | 1 |
| the endpoint answers `ok=false` | `not a valid Explanation envelope` | 1 |
| **the endpoint does not answer at all** | **threw — now** `the check itself failed` | 1 |

### `ceiling` — every identity fires, including the stale-cache cross-check

| Mutation | Fires as | Problems |
|---|---|---|
| `totalDelta` no longer gross − net | `totalDelta is …, but gross − net is …` | 3 (it is load-bearing for both axes) |
| a bucket amount moved | `the reconciled axis sums to …` | 1 |
| a bucket amount moved | `the basis axis sums to …` | 1 |
| reconciled shares stop pairing to 1 | `the reconciled shares sum to …` | 1 |
| basis shares stop pairing to 1 | `the basis shares sum to …` | 1 |
| a `missingFields.wouldResolve` moved | `missingFields resolve …` | 1 |
| a missing field's citation emptied | `carries an empty citation sourceId` | 1 |
| `annualisedFee` off by a paisa | `is not twelve months of` | 1 |
| fee on zero-MDR rails exceeds its gross | `exceeds the gross that sat on them` | 1 |
| **stale cache A** — the explanation's line flags moved, the ceiling did not | `which is what a stale ceiling looks like` | 1 |
| **stale cache B** — the basis split wrong while the axis still balances | same, plus the partition | 2 |
| ceiling served for a different settlement | `the ceiling is for … but the explanation is for …` | 1 |
| endpoint throws / `ok=false` / non-object / schema-rejected | four distinct messages | 1 each |

The two stale-cache rows are the ones worth naming. In **A**, nothing in the
ceiling payload is touched: every axis still sums to `totalDelta`, both share
pairs still make 1, the partition still closes. Only the cross-check that
re-derives `basisUnverifiable` from the explanation's own line flags can see it.
In **B**, both halves of the basis axis move by the same paisa, so the axis
**still** sums correctly — and again only the partition check and the line
cross-check notice. Both fire. That check earns its keep.

### `cross-cycle` — it really does cover more than `ceiling`

The load-bearing test: build a four-settlement live list, break the **last**
one, and point `ctx.settlementId` at the **first**. `ceilingCheck` returns `[]`.
`crossCycleCheck` returns a problem naming the broken settlement's id. That is
the difference between the two checks, demonstrated rather than asserted.

Also fires correctly on: a live deploy listing exactly one settlement (the
"covered nothing" finding, correctly suppressed when `/v1/health` says `mock`);
an empty list; a repeated id; a list endpoint that does not answer; and a server
that returns the same cursor forever — which terminates at the cap rather than
paging until the run is killed.

One test pins the cap with a number instead of a claim: twelve consistent
settlements, all green, and exactly **10 of 12** actually fetched. An operator
reading a green `cross-cycle` row should know that is what it covered.

## Two gaps left open, deliberately, without editing anything

Neither is a failure to catch what the check *claims* to catch, so neither was
"fixed" — a check must not grow new opinions in a stream whose job was to test
it. Recording them here instead.

1. **Shares are never cross-checked against their own amounts.** `ceiling.ts`
   asserts that `amountReconciled.share + amountUnreconciled.share` rounds to 1,
   and the same for the basis pair, but never that a bucket's `share` equals its
   `amount / totalDelta`. A ceiling whose amounts are right and whose shares are
   from a previous cycle passes. That is a stale-cache shape the cross-check
   does not reach, because the cross-check compares amounts.

2. **`cross-cycle` runs the ceiling identities over the list, never the
   waterfall ones.** A settlement whose explanation breaks W1–W5 but whose
   ceiling is self-consistent is only caught if it happens to be
   `ctx.settlementId`. The cap of 10 is a documented, deliberate limit and is
   fine; this one is a coverage asymmetry rather than a limit.

## Verification

Real output, this stream, after the fix:

```
pnpm typecheck   → clean (tsc --pretty false, no output, exit 0)
pnpm test        → tests 74 · pass 74 · fail 0
                   (15/15 @assay/contract + 59 engine, of which 45 are this file)
pnpm test:golden → tests 6 · pass 6 · fail 0
pnpm verify:mock → 13/13 passed, incl. waterfall / ceiling / cross-cycle
                   over the wire
```

Before the fix the same file read `tests 45 · pass 44 · fail 1`, the single
failure being the dead-endpoint case above.

Files touched by this stream, and no others:

- `apps/api/test/invariants.test.ts` (new)
- `tools/invariants/waterfall.ts` (one `try`/`catch` and one `describe` helper)
- `docs/log/ws-invariants.md` (this file)

`tools/invariants/ceiling.ts` and `tools/invariants/cross-cycle.ts` were read
closely and **not edited** — every identity they claim, fires.
