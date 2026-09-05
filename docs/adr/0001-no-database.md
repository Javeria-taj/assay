# ADR-0001 — No database

**Status:** Accepted, 5 September 2026. Supersedes nothing.

---

## Context

Assay answers nine read-only endpoints about a settlement cycle. The obvious
architecture stores the cycles it fetched and the explanations it computed, and
serves them back.

But look at what an answer actually depends on. `calculate(cycle, policy)` in
`apps/api/src/engine/calculate.ts` is pure — no HTTP, no env, no clock, no
randomness, no I/O — and so is `analyseCeiling(explanation)` in
`engine/ceiling.ts`. The cycle it consumes is itself a pure function of a seed:
`sources/rng.ts` is FNV-1a into mulberry32, arithmetic only, and
`sources/synthetic.ts` draws every event from sub-streams of one seed string.
The policy is `domain/committed-policy.ts`, which is the contract's own `POLICY`
re-exported rather than retyped. And the clock is a dependency — `config.ts`
reads it once per request and hands the number down, which is why
`DisputeWindow.serverNow` is called *server*-now.

So the entire served surface is a function of two things that are already in the
repository: six seed strings in `SEEDS` and one approved policy. A database
would hold nothing that could not be recomputed, and would add a second thing
that could be wrong.

## Decision

**No database, no disk, no cache server.** Everything computes per request. A
restart re-derives rather than reloads.

Two in-process `Map`s exist and neither is storage:

- `apps/api/src/store.ts` — `memo(namespace, key, make)`, used by
  `engine-computed.ts` for exactly the two answers that do not move with the
  clock (the explanation and the ceiling) and by `synthetic.ts` for the
  generated cycle. Namespaced by `source.kind`, so a live and a synthetic engine
  never share a cell.
- `domain/policy.ts` — `InMemoryPolicyStore`, which holds one policy at a time.

Dropping either changes latency and nothing else. The window, the report and the
forecast take `now` as a parameter and are therefore never cached at all.

## Consequences

**There is no audit trail across restarts.** Nothing records that a particular
explanation was served, to whom, at what time. A frozen policy version plus a
seed reproduces the same numbers, but reproduction is not a record of what a
merchant was shown — and for a product whose whole claim is that a merchant
should be able to check a figure inside three days, that is a real absence, not
a rounding error.

**There is no history a merchant could return to.** Six cycles exist because six
strings are listed in `SEEDS` (`CANONICAL_SEED` plus five in `HISTORICAL_SEEDS`).
A seventh cycle is a code change, not a write. Relatedly, `ASSAY_SEED` is
declared in `render.yaml` and read by nothing: `SyntheticSettlementSource`
takes its seeds from the constant. Configuration that looks live and is not.

**The memo is per instance.** `cells` in `store.ts` is module scope. Two Render
instances behind one URL would each hold their own copy, warm their own cache,
and have no way to invalidate either except a restart. Today they would agree,
because every cached value is a pure function of inputs both instances share —
which is precisely why the failure would be silent the first time an answer
stopped being one.

**The approval step has nowhere to persist.** `InMemoryPolicyStore.approve()`
stamps `approvedBy` and `approvedAt` into a `Map` that dies with the process.
See ADR-0003.

**This is not deployed.** `render.yaml` is committed and both services build,
but the Blueprint was never created and there is no URL. The two-instance
consequence above is prospective, not observed.

Against that: **there is no state to be wrong.** No migration, no stale row, no
cache that disagrees with the thing it caches, no fixture drift between what was
stored and what the code now computes. A clean clone reproduces the demo
exactly — `pnpm test` is 15/15 contract and 97/97 engine, `pnpm test:golden` is
6/6, `pnpm verify:mock` is 14/14, and 14/14 again against the real API run
locally. That reproducibility is the thing being bought, and a database is what
it would have been spent on.
