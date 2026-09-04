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

### The instrument sub-type is genuinely absent from the settlement report — and the product's phrasing needs tightening

This is the product's own finding turning up in our own code, and it is more
interesting than expected.

The recon report row — the thing closest to what the merchant is actually given
— carries `method` (`card` / `netbanking` / `wallet` / `emi` / `upi`) and, for
cards, `card_type` and `card_network`. It carries **nothing** that separates
bank-account UPI from RuPay-credit-on-UPI from PPI-on-UPI. Those three carry
materially different statutory MDR and arrive indistinguishable. Confirmed at
the type level: `payer_account_type` appears nowhere in the settlement typings.

But the *payment* entity is documented to carry `upi.payer_account_type` with
exactly the three values `bank_account | credit_card | wallet`. So the field is
not missing from the rail — it is missing from the settlement report, and
recovering it means joining every settled row back to its payment one at a time.

Two consequences. First, `README.md` and `docs/assay_context.md` say the field
"does not exist"; the defensible claim is that it does not exist *on the report
she is given*, which is a sharper point and survives contact with someone who
knows the API. Second, `payer_account_type` is absent from the official Node
SDK's typings altogether, so even the join needs a cast around the SDK.

The adapter refuses to guess: `instrumentFromReport` returns null for UPI and
the cycle carries a `SourceGap` naming the field, where it was looked for, and
how many rows are affected.

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
