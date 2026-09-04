# Build log

What broke, what surprised us, and what we did about it. Written in the moment,
newest last. Engineering judgement only — no dependency-version stories.

---

## Batch 1 — infrastructure

### Hono turns a thrown error into its own 500 before an outer middleware sees it

Expected a single outermost middleware to catch anything thrown below it and
wrap it in the contract envelope. Instead `POST /v1/health` and an unknown path
both came back as plain-text `500 Internal Server Error`: Hono's compose catches
at each dispatch level and hands the error to its own handler, so the throw
never reached our `try`. Rewrote expected failures — a refused method, an
unknown route — to travel as data on the context rather than as exceptions.
`onError` is kept as a last-resort net for genuine bugs. Failures that are part
of the contract are not exceptional, and modelling them as data turned out to be
the more honest design anyway.

### The envelope middleware replaces `c.res`, so CORS had to sit outside it

With the envelope registered outermost, its post-processing ran last and
replaced `c.res` wholesale — discarding the `Access-Control-Allow-Origin` header
the CORS layer had just set. Every error response would have been unreadable to
the browser. Swapped the order so CORS wraps the envelope and decorates the
finished response. Verified both directions: an allowed origin gets the header,
a disallowed one gets none and the browser blocks it.

### `transpilePackages` is not sufficient for `@assay/contract`, contrary to the handoff

`@assay/contract` ships TypeScript whose internal re-exports use the
`./money.js` convention — a specifier pointing at `money.ts` on disk. Turbopack
reads the package as having no exports at all and the build fails; only webpack
can be told to resolve `.js` to `.ts`, via `resolve.extensionAlias`. Pinned the
web app to `next build --webpack`. The durable fix is a build step on the
contract package, which is out of scope while it is frozen. `FRONTEND.md`
currently tells Javeria that `transpilePackages` is the whole answer, and it
is not.

---

## Batch 2 — the Razorpay spike and the source adapter

### The spike could not call anything: there are no credentials

Expected to spend thirty minutes discovering real response shapes. There is no
`.env.local` in the repo and no `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in the
environment, so zero calls were made and the 30-minute cap was never reached.
`docs/razorpay-shapes.json` records `not_called` explicitly for all six
endpoints rather than implying they were tried and came back empty.

Rather than leave the file useless, every endpoint carries the field list from
the published docs, marked `observed: false`. The distinction is deliberate and
matches the repo's own documented-versus-constructed discipline: these are
fields we were *told* about, and the first real response supersedes them. The
script is committed and runnable — `pnpm spike:razorpay` fills the file in the
moment keys exist.

### The recon report is keyed by year and month, not by settlement

Assumed the transaction-level breakdown would hang off a settlement id, the way
the rest of the settlement API does. It does not:
`GET /v1/settlements/recon/combined?year=yyyy&month=mm`. A cycle has to be
located *inside* a month and then filtered back out of it by `settlement_id`.
The adapter fetches the month and filters. Worth knowing before Batch 4 designs
around a per-settlement fetch that does not exist.

### We said the instrument sub-type does not exist. It does — and the real finding is better

We claimed the instrument sub-type did not exist. It does — on the payment
entity, as `upi.payer_account_type`, with exactly the three values the fee
analysis turns on. What it is missing from is the settlement recon report,
which is the artifact a merchant actually reconciles against.

So the ceiling is not a data-availability problem, it is a placement problem:
the field exists, it is not where the decision is made, and moving it there
costs one API call per settled transaction. That reframing survives a reader
who knows the API, and it sharpens the ask from "collect this field" to "put
`payer_account_type` on the recon row."

Confirmed at the type level: `payer_account_type` appears nowhere in the
settlement typings, and the recon row carries only `method` — which reads
`UPI` for all three rails. It is also absent from the official Node SDK's
typings altogether, so even the per-payment join needs a cast around the SDK.

The adapter refuses to guess: `instrumentFromReport` returns null for UPI and
the cycle carries a `SourceGap` naming the field, where it was looked for, and
how many rows are affected. Corrected in `README.md` (both tables),
`docs/assay_context.md` (both tables) and the fixture copy.

### Failed attempts cannot come from a settlement at all

They are chargeable — ₹3 each in the worked example, 1,100 of them — but a
settlement recon report contains settled transactions by construction, and a
failed attempt never settles. There is no field to read and no join to make:
the payments list has them, but the report gives no way to scope that list to
one cycle. Recorded as a `SourceGap` with the reasoning, and
`failedAttemptCount` is left at zero on the live path rather than filled with
a plausible number.

### `fees` and `tax` on the on-demand settlement are real

The one piece of good news, and the one §4.1 depends on. The
`settlement.ondemand` entity carries both `fees` and `tax` as integer paise.
The design rule — read the rupees the rail returned rather than a rate we typed
in — holds against the actual API, and the live adapter reads both fields
directly with no rate anywhere near them.

---

## Wave 0 — freezing the seam

### Two Batch 2 types had to change, and this was the last moment they could

`SourceGap` had no `id`. `ComputedLine.derivedFromGaps` and
`MissingFieldResult.gapId` both need something to point at, and the whole
ceiling mechanism depends on that pointer: without it, "these three missing
fields do not overlap and sum to the whole" is a claim in prose rather than
something a test can assert. Added `id`, gave the live driver stable ones.

`RawCycle` imported `Instrument` from `@assay/contract`. The seam's rule is
that nothing below the route layer knows the public contract, so the domain now
declares its own `Instrument` and `to-contract.ts` asserts the two unions agree
at compile time. `RawCycle`'s shape is unchanged — only where the name comes
from. Both changes are extensions rather than redesigns, and both are the kind
of thing that becomes a two-person decision from here on.

### `basisVerifiable` is derived in one place, and that is the ceiling

The temptation is to let each line say whether it is checkable. That makes the
ceiling an opinion. Instead `computedLine()` derives it —
`derivedFromGaps.length === 0` — and it is the only place in the codebase that
decides. A line is checkable exactly when its basis leans on no gap the adapter
reported, so the ceiling falls out of what the rail could not answer. If the
rail starts answering, the number moves on its own and nobody edits a
percentage.

The factory also refuses to build an unverifiable line that cannot say which
field is missing, which is contract invariant 6 enforced at construction rather
than checked at the edge.

### The golden test is committed failing, on purpose

`pnpm test:golden` runs seven assertions against `computeSettlement` and all
seven fail with `the calculator stream owns this`. That is the gate working:
it fails for the right reason, not a type error or a bad import, so the moment
the calculator lands the test tells the truth about whether it reproduces §3.4
to the paisa. Kept out of `pnpm test` so CI stays green while wave 1 is in
flight.

### Reviewing the seam from each stream's seat found five real holes

Before freezing, four reviewers each took one wave-1 stream's seat and tried to
build it against the types. Between them they raised 15 blockers. An
adversarial verify pass then refuted all forty findings — which was itself the
finding: the refuter had been told to default to refuted when uncertain, and a
refuter with that instruction returns zero every time. A verification pass that
cannot fail is not verification. Checked the blockers by hand instead.

Five were real, and all five were in types written an hour earlier:

`ComputedInstrumentSlice` had no `id`, while `MissingFieldResult` carries
`attributableSliceIds: string[]` to point at slices. The ceiling stream would
have had nothing to assert the partition against — the exact property that
makes "these three do not overlap" checkable rather than asserted.

`CycleRef` carried one `id`, but the frozen contract enforces `stl_` and `cyc_`
prefixes on two separate fields and neither derives from the other. The
calculator could not have produced both.

`tax_on_fees` said "applied to the sum of fee lines", which reads unambiguous
and is not: taxing the gateway fee alone gives ₹4,320 and taxing every fee line
gives ₹5,094. The canonical figure is the former. Two streams would have
disagreed by ₹774 and both would have thought they were right, so the line now
names `taxableLineIds` explicitly.

`networkMdrBps` was required on every slice with no source anywhere in the
domain — no rail returns statutory MDR. It is reference data, so it now lives
in `domain/instrument.ts` as a table rather than being invented per-stream.

`Backtest.medianAbsError` was a required number, so a forecast with zero
backtested cycles had to report zero error — precisely what contract invariant
10 forbids. Both error fields are now nullable.

Two more surfaced that are worth stating rather than fixing. The live rail
exposes no merchant pricing plan at all, so `merchantExpected` has no rate to
be computed from on the live path — recorded as a gap on the cycle rather than
invented. And `buildDisputeWindow(settledAt, now)` cannot produce the
`settlementId` and `clause` its return type requires; the signature came from
the brief, so it is flagged rather than changed.
