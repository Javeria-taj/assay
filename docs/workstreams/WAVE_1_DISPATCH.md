# Wave 1 — dispatch prompt

Save the three briefs into the repo first:

```bash
mkdir -p docs/workstreams
# copy WS_1_ws-generator.md, WS_1_ws-calculator.md, WS_1_ws-ceiling.md into docs/workstreams/
```

Then paste everything below the line into Claude Code.

---

You are orchestrating wave 1 of the Assay backend build. Three workstreams run
**concurrently, as three separate agents**. They share no files. Your job is to
dispatch them, hold the ownership boundary, and merge.

## Before you dispatch — blocking preconditions

1. **Wave 0 must be pushed.** `apps/api/src/domain/**`, `apps/api/src/engine/ports.ts`
   and the golden test must exist. If they do not, stop: run `WS_0_ws-seam.md`
   first, alone. Nothing in wave 1 compiles without the seam.
2. **Reconcile the paths before anyone writes code.** The briefs were authored
   against an assumed layout and the repo differs. Batch 2 actually created
   `apps/api/src/sources/` (plural) and `apps/api/src/domain/raw-cycle.ts`.
   The briefs say `apps/api/src/source/` (singular) and `domain/raw.ts`.
   **Pick whatever is already on disk, write the decision at the top of
   `docs/workstreams/PATHS.md`, and hand that file to all three agents.** Do not
   let three agents each guess. Do not rename existing Batch 2 files to match a
   brief — the brief is wrong, the repo is right.
3. `pnpm test` green, `pnpm typecheck` clean, working tree clean, branch pushed.

## The three agents

Dispatch all three at once. Each gets: its own brief, `docs/workstreams/PATHS.md`,
`docs/assay_context.md`, and the corrections section below.

| Agent | Brief | Owns, exclusively |
|---|---|---|
| **WS-2 generator** | `docs/workstreams/WS_1_ws-generator.md` | `src/sources/rng.ts`, `src/sources/synthetic.ts`, `test/generator.test.ts`, `docs/log/ws-generator.md` |
| **WS-1 calculator** | `docs/workstreams/WS_1_ws-calculator.md` | `src/engine/policy-apply.ts`, `src/engine/calculate.ts`, `src/engine/instrument-mix.ts`, `test/calculator.test.ts`, `tools/invariants/waterfall.ts`, `docs/log/ws-calculator.md` |
| **WS-3 ceiling** | `docs/workstreams/WS_1_ws-ceiling.md` | `src/engine/ceiling.ts`, `test/ceiling.test.ts`, `test/cross-cycle.test.ts`, `tools/invariants/ceiling.ts`, `tools/invariants/cross-cycle.ts`, `docs/log/ws-ceiling.md` |

**Nobody touches `packages/contract/**`.** It is frozen at v0.1.0. A contract
change is refused, not escalated.

**Nobody touches `apps/api/src/domain/**`.** That is wave 0's. If an agent
believes a domain type is wrong, it stops and reports — it does not edit, and it
does not privately reimplement the function it disagrees with.

**`docs/BUILD_LOG.md` is append-only.** Each agent appends under its own
`## WS-n · <name>` heading at the bottom, never reflows or reorders another
agent's lines, and runs `git pull --rebase` immediately before any push that
touches it.

## Corrections that override the briefs

These are verified against `packages/contract/src/fixtures.ts`. Where a brief
disagrees, these win.

**1. The attribution key is `reportedAs`, never `citation.sourceId`.**
Grouping the instrument mix by citation gives ₹3,600 for `instrument_subtype`,
because the bank-UPI slice cites the zero-MDR statute rather than the UPI
collapse. Grouping by `reportedAs` gives ₹18,000, and the three fields then sum
to ₹24,000 exactly. Verified:

```
grouped by citation.sourceId : ₹3,600     <- wrong, silently drops ₹14,400
grouped by reportedAs        : ₹18,000    <- correct
```

**2. `zeroMdrExposure` must not filter on `networkMdrBps === 0`.**
Netbanking also carries 0. The naive filter returns ₹15,600 against a fixture
that asserts ₹14,400. Use the named `isStatutoryZeroMdr` predicate — statutory
zero-MDR rails only, meaning UPI from a bank account and RuPay debit.

**3. `collapsedInReport` is not "another slice shares my `reportedAs`".**
`card_credit` is alone in the fixture mix, so that rule gives it `false` and
breaks the assertion. Derive it from `attributionOf(slice) !== "per_line_fee_basis"`.

**4. `basisVerifiable` is derived, not assigned.**
This is a change to the wave-0 design and it matters. A line's
`basisVerifiable` is `false` when its computation depended on a field the source
could not supply — read from the cycle's declared gaps — not because someone
hardcoded `false` on the gateway-fee line. The synthetic generator declares the
same gap explicitly, so the fixture still reproduces. This is what makes the
ceiling fall out of what the adapter genuinely could not answer, rather than
being asserted; on the live path it is the difference between a real finding and
a decoration. Implement it in exactly one place and make
`grep -rn "basisVerifiable" apps/api/src` show no hand-assignment outside it.

## The gate

`pnpm test:golden` is a **counter, not a boolean**. Report `N/34` passing, not
pass/fail. Read it when the first agent lands, and again after each merge. A
boolean tells you nothing until the moment it is too late to cut.

The calculator reproducing the worked example to the paisa is the only
non-negotiable outcome of this wave. If it is not converging, cut the generator's
adversarial second seed before you cut anything in the calculator.

## Merge protocol

Merge in the order the agents finish; the file sets are disjoint so order does
not matter. After each merge: `pnpm test`, `pnpm typecheck`, `pnpm test:golden`.
If a merge breaks another stream's test, the breaking stream fixes it — never
the stream that was already green.

## Report back

For each agent: the paths it created, `pnpm test:golden` N/34 after its merge, and
anything it escalated rather than fixed. Then the combined state: `pnpm test`,
`pnpm typecheck`, `pnpm verify:mock`, and the golden counter.
