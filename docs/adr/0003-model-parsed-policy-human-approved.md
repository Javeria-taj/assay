# ADR-0003 — The policy is model-parsed and human-approved, and rupees come from the rail

**Status:** Accepted, 5 September 2026. The live parser described in "Consequences"
was cut; the committed approved policy ships in its place.

---

## Context

A fee policy starts life as prose — a rate card, a terms-and-conditions page, a
pricing plan PDF. Turning that into something a calculator can apply is exactly
what a language model is good at, and exactly what deterministic code is bad at.

Computing the rupee is the reverse. A model that multiplies is a model that can
be quietly wrong about money, on camera, with no citation to check it against.
And a rate typed into the repository by a human is barely better: it is correct
until the day it is not, and nothing in the system notices the day.

## Decision

**The model reads and writes English. Deterministic code touches the money.**
Three enforcement points, none of them a convention someone has to remember.

**1. Policy is always parsed, never hand-written.** `PolicyLine` in
`packages/contract/src/contract.ts` carries `parsedBy: z.literal("model")`.
There is no other permitted value, so the schema itself says Assay does not
author its own rate card.

**2. Approval before arithmetic.** `applyPolicy()` in
`engine/policy-apply.ts` sweeps every line up front — before a single rupee —
and throws `PolicyNotApprovedError` (code `policy_not_approved`) on the first
line without a human's approval. The sweep is deliberately up front: checking
lazily lets P-01 through P-04 compute real money before an unapproved P-05 is
reached, so the refusal arrives *after* the arithmetic instead of instead of it.
`routes/answer.ts` maps the error to a 409. At the type level,
`domain/policy.ts` defines `ApprovedFeePolicy` with `isApproved()` as its only
narrowing route and `InMemoryPolicyStore.approve()` as its only constructor;
`engine/ports.ts` carries the compile-time proof that a `FeePolicy` will not
substitute for one.

**3. Rupees come from the rail, not from a rate we typed in.** The on-demand
settlement fee has no rate anywhere in this repository. `P-05` in
`packages/contract/src/fixtures.ts` carries
`readFromApi: "settlement.fees + settlement.tax"` with `rateBps: null`, and the
domain's `ReadFromApiLine` variant in `domain/policy.ts` has no rate field to
put one in. `onDemandFee()` reads `facts.feesPaise + facts.taxPaise` and asserts
both that the expression is the one it knows how to honour and — via
`readFromApi()` — that the line has not grown a rate. If either changes, it
refuses rather than guessing. The one external fact this rule leans on — that
the `settlement.ondemand` entity carries `fees` and `tax` as integer paise — is
recorded in `docs/razorpay-shapes.json` as `observed: false`, `status:
"not_called"`: it comes from the published documentation, because the spike had
no credentials and made zero live calls. The rule is sound against the
documented shape and has never been run against a real settlement.

## Consequences

**The live parser was cut, so what ships is the committed approved policy.**
There is no `/ops/policy/parse` route — `apps/api/src/routes/` holds `answer`,
`forecast`, `health`, `index`, `policy`, `settlements` and nothing else — and
`@anthropic-ai/sdk` is in no `package.json` in the workspace. `render.yaml`
declares an `ANTHROPIC_API_KEY` that nothing reads. What computes every rupee is
`COMMITTED_POLICY`, the contract's own `POLICY` re-exported: version
`2026-09-04.1`, six lines P-01 through P-06, each with its verbatim quote, its
source document, a named approver and a timestamp. This is the documented
fallback rather than an accident — but it means the model's step in this
pipeline is described and typed, not demonstrated.

**The approval step is exercised by tests, not by an operator.**
`apps/api/test/calculator.test.ts` flips `approved` to false and asserts that
both `applyPolicy` and `calculate` throw `PolicyNotApprovedError`. That is the
refusal working. There is no approval UI, no route that approves, and
`InMemoryPolicyStore.approve()` has no caller on any request path.

**The compile-time gate does not sit on the shipping path.** `PATHS.md` §3
resolved the seam in favour of contract types, so the served calculator's
signature is `calculate(cycle: RawCycle, policy: Policy)` — the contract's Zod
type, whose `approved` is a plain boolean. `ApprovedFeePolicy` and its proof are
real and typecheck, but they live on `engine/ports.ts` and `domain/policy.ts`,
which `engine-computed.ts` does not route through. On the path that actually
serves a rupee, the guard is `applyPolicy`'s runtime sweep. Two guards, one of
them currently on the road not taken.

**`/v1/policy` serves unapproved lines too.** Hiding them would be the wrong
kind of tidy: an unapproved line is a fact about the policy, and it is
`applyPolicy` that refuses to compute from one.

**P-05 buys correctness by giving up derivation.** With no rate, Assay can state
an on-demand fee only where the rail has already reported one —
`engine/forecast.ts:144` reads it off the projected cycle's own settlement
facts. It cannot derive the fee for a settlement that does not yet exist. That
is the intended trade: a figure Assay declines to predict is better than a stale
rate it predicts confidently.
