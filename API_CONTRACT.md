# Assay API contract — v0.1.0

**Frozen Friday 4 September 2026, 13:30 IST.** Any change after the freeze is a
two-person decision announced in chat and bumps `CONTRACT_VERSION` in
`packages/contract/src/contract.ts`.

The contract is `packages/contract/src/contract.ts` — a set of Zod schemas
imported by **both** the API and the web app. It is the only definition of the
API that exists. This document explains the conventions; the file is the truth.

---

## Conventions

| | |
|---|---|
| **Money** | Integer **paise**, signed. `₹11,28,918.00` is `112891800`. Deductions are negative. There are no floats anywhere in this API and no currency field — it is INR-only. Use `formatPaise()` from `@assay/contract` to render. |
| **Time** | Epoch **milliseconds**, integer, UTC. Never a string, never a timezone. |
| **Envelope** | Success `{ ok: true, data, requestId }`. Failure `{ ok: false, error: { code, message, field }, requestId }`. |
| **Paging** | Cursor: `{ items, nextCursor }`. `nextCursor: null` is the last page. |
| **Method** | `GET` only. Assay is read-only by construction — it never moves money and the Razorpay MCP server runs with `READ_ONLY` set. Anything else returns `405`. |
| **Auth** | `Authorization: Bearer <token>`. The mock ignores it. |
| **Clock** | Any countdown is driven by `serverNow` returned by the server, never by the client's clock. |

## Error codes

`not_found` · `bad_request` · `unauthorized` · `policy_not_approved` ·
`reconciliation_failed` · `internal`

`reconciliation_failed` is the important one: if the waterfall does not sum to
the credited amount, the API **refuses to answer** rather than rendering a
number that does not add up.

---

## Endpoints

| Name | Path | Returns |
|---|---|---|
| `health` | `GET /v1/health` | contract version, `source: mock \| live` |
| `listSettlements` | `GET /v1/settlements` | paged `SettlementSummary` |
| `getSettlement` | `GET /v1/settlements/:settlementId` | `SettlementSummary` |
| `getExplanation` | `GET /v1/settlements/:settlementId/explanation` | **`Explanation`** — the product |
| `getCeiling` | `GET /v1/settlements/:settlementId/ceiling` | `Ceiling` — the gap panel |
| `getWindow` | `GET /v1/settlements/:settlementId/window` | `DisputeWindow` — the 3-day countdown |
| `getReport` | `GET /v1/settlements/:settlementId/report` | `DiscrepancyReport` |
| `getForecast` | `GET /v1/forecast/current` | `Forecast` |
| `getPolicy` | `GET /v1/policy` | `Policy` — every rule, with its citation and approver |

`endpoints` in `contract.ts` is the machine-readable version of this table.
`verify-contract.ts` iterates it, so **an endpoint not in that object is not part
of the contract.**

---

## The two ideas the schema encodes

Everything else is plumbing. These two are the submission.

### 1. Every rupee cites its source

Every `ExplanationLine` carries a `citation` with a `kind`:

| kind | meaning | strength |
|---|---|---|
| `api_field` | read verbatim off the rail's own response | strongest — cannot go stale |
| `policy_line` | model-parsed from a rate card or T&C, **human-approved before first use** | strong |
| `statute` | a published law or regulation | strong |
| `derived` | deterministic arithmetic over other cited lines | strong |

§4.1 of the handoff is enforced here structurally: the on-demand settlement fee
has **no rate in the policy at all**. `P-05` carries
`readFromApi: "settlement.fees + settlement.tax"` and `rateBps: null`. A rate we
typed in is a rate that can be wrong on camera.

The UI renders `citation.label` as the chip, `citation.title` and
`citation.quote` in the line drawer, and shows the "read from the API" marker
when `kind === "api_field"`.

### 2. Reconciling and verifying are different questions

Two independent booleans on every line, and two independent buckets in
`Ceiling`. **Do not collapse them.**

- **`amountReconciled`** — does the number add up against the rail's figures?
  For Meera: **100%**. Every rupee of the ₹71,082 delta is accounted for.
- **`basisVerifiable`** — can the merchant *check* the rule that produced it,
  from fields she is actually given? For Meera: **66.24%**. The ₹24,000 gateway
  fee reconciles perfectly and cannot be checked at all, because it spans five
  rails with different statutory MDR and three of them are reported to her
  identically as `"UPI"`.

That is the finding, and it is why the headline is *"every rupee reconciles;
₹24,000 of it you have no way to check"* rather than *"₹24,000 is missing."*
Constructive, not accusatory — handoff §3.7.

`Ceiling.missingFields` names the three fields that would close the gap, with a
**non-overlapping** `wouldResolve` each. They sum exactly to
`basisUnverifiable.amount`; the test asserts it.

---

## Invariants the API must hold

Asserted by `pnpm test` on the fixture and by `pnpm verify` against any live
API. All of them are hard failures.

1. Signed `lines` (excluding `net_credited`) sum **exactly** to `netCredited`.
2. `reconciliation.delta === 0`.
3. `merchantExpected − netCredited === unexplainedGap`.
4. `instrumentMix` gross sums to `grossCaptured`; instrument fees sum to the
   gateway fee line.
5. Every line has a citation with a non-empty `sourceId`.
6. `basisVerifiable: false` requires a non-null `unverifiableReason` naming the
   missing field.
7. `Ceiling` buckets sum to `totalDelta` on both axes; shares sum to 1.0000.
8. `missingFields[].wouldResolve` sums to `basisUnverifiable.amount`.
9. Every policy line is `parsedBy: "model"` **and** `approved: true` with a
   named approver and timestamp, or it may not be used to compute a rupee.
10. `Forecast.backtest.cycles === 0` renders as *"accuracy not yet measured"* —
    never as zero error.

---

## Changing the contract after 13:30

1. Say so in chat. Both people, before the edit.
2. Bump `CONTRACT_VERSION`.
3. `pnpm fixtures:build` and commit the regenerated JSON.
4. `pnpm test && pnpm verify:mock` green before the push.

CI enforces 3 and 4.
