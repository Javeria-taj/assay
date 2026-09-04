# Frontend handoff — Javeria

Everything you need to build the whole UI without waiting for the API. **You
never need the real backend to finish this.** When it lands you change one env
var.

---

## Start in 60 seconds

```bash
pnpm install
pnpm mock                 # http://localhost:4317
```

Then, in another terminal:

```bash
curl -s localhost:4317/v1/settlements/stl_2608mera01/explanation | head -50
```

The mock has **zero dependencies** and reads a committed JSON fixture, so it
runs on a clean clone even if `pnpm install` is still going.

---

## Wire it into the Next.js app

`apps/web/.env.local`:

```
NEXT_PUBLIC_ASSAY_API=http://localhost:4317
```

`next.config.js` — the contract package ships TypeScript, so Next must
transpile it:

```js
const nextConfig = { transpilePackages: ["@assay/contract"] };
export default nextConfig;
```

Then:

```ts
import { createClient, formatPaise } from "@assay/contract";

const api = createClient({ baseUrl: process.env.NEXT_PUBLIC_ASSAY_API! });
const explanation = await api.getExplanation({ settlementId: "stl_2608mera01" });

formatPaise(explanation.netCredited); // "₹11,28,918.00"
```

Every response is parsed through the Zod schema before it reaches a component.
If the real API ever drifts, you get a loud `AssayContractError` at the boundary
instead of a wrong number rendered as if it were right. **That is deliberate —
do not catch and swallow it.**

**Switching to the real API is one line:** change `NEXT_PUBLIC_ASSAY_API`. No
code change.

---

## Every state you need to build, on demand

```bash
ASSAY_MOCK_WINDOW=open     pnpm mock   # ~66h left on the 3-day clock
ASSAY_MOCK_WINDOW=closing  pnpm mock   # ~18h left — amber. This is the default.
ASSAY_MOCK_WINDOW=expired  pnpm mock   # the right lapsed. The point of the product.
ASSAY_MOCK_WINDOW=fixed    pnpm mock   # frozen clock, for deterministic screenshots

ASSAY_MOCK_LATENCY_MS=1200 pnpm mock   # build the loading states honestly
ASSAY_MOCK_FAIL=getCeiling pnpm mock   # build the error state for one panel
ASSAY_MOCK_EMPTY=1         pnpm mock   # empty settlement list
```

Record the video against `closing`. The amber countdown is the tension.

---

## The numbers you are rendering — HANDOFF §3.4

Everything is **integer paise**. `formatPaise()` renders Indian grouping.

| | paise | renders |
|---|---|---|
| `grossCaptured` | `120000000` | ₹12,00,000.00 |
| `merchantExpected` | `114400000` | ₹11,44,000.00 |
| `netCredited` | `112891800` | **₹11,28,918.00** |
| `unexplainedGap` | `1508200` | **₹15,082.00** |
| `ceiling.totalDelta` | `7108200` | ₹71,082.00 |
| `ceiling.basisUnverifiable` | `2400000`, share `0.3376` | ₹24,000.00 · 33.8% |

---

## Mapping the wireframe onto the contract

Wireframes: **Assay Wireframes**, seven artboards.
<https://claude.ai/code/artifact/a90a7e4e-4afb-4ebf-a051-2b13bc1e9704>

The screen (default), the line drawer, the report sheet, the three window
states, loading/error/empty, mobile at 390, and a reference sheet carrying the
tokens, component anatomy and the scope. Every number on those artboards comes
from this repo's mock. This supersedes page 2 of the old Interlock Wireframes
canvas — ignore that one.

**Scope, locked:** one route `/s/[settlementId]`. Three zones (verdict header
with the window strip, the waterfall, the ceiling panel), two overlays (line
drawer, report sheet), and a forecast strip below the fold. No landing page, no
settlement list, no settings, no auth, no gateway-connect flow, no policy page —
the policy is reachable through any citation chip.

| Wireframe element | Field |
|---|---|
| Waterfall rows | `explanation.lines[]` — `label`, `amount`, `runningBalance` |
| Citation chip on a row | `line.citation.label` |
| Line drawer contents | `line.basis.formula`, `line.basis.inputs[]`, `line.citation.title`, `line.citation.quote`, `line.citation.url` |
| "not on your dashboard" marker | `line.onMerchantReport === false` |
| "fee read from the API" marker | `line.citation.kind === "api_field"` |
| Row flagged as uncheckable | `line.basisVerifiable === false` → render `line.unverifiableReason` |
| Gap headline | `explanation.unexplainedGap` + `ceiling.headline` |
| Explainable / unexplainable bar | `ceiling.basisVerifiable.share` vs `ceiling.basisUnverifiable.share` |
| The three missing fields | `ceiling.missingFields[]` — `name`, `whyItMatters`, `wouldResolve` |
| Instrument breakdown | `explanation.instrumentMix[]` — `collapsedInReport: true` is the ones her report calls "UPI" |
| 3-day countdown | `window.msRemaining`, `window.status`, driven off `window.serverNow` |
| Countdown tooltip / clause | `window.clause.quote` |
| Report button → preview | `report.body` (markdown), `report.claims[]` |
| Forecast view | `forecast.projectedLines[]`, `forecast.backtest` |

---

## Five things that will cost you if you miss them

1. **The countdown must use `window.serverNow`, not `Date.now()`.** The server
   returns its own clock with every response; drive the ticker off the offset
   between the two. A countdown that disagrees with the server on camera is the
   kind of detail a payments panel notices.

2. **`merchant.constructed` is always `true`, and the UI must say so.** Handoff
   §3.7 — a visible, unembarrassed label ("constructed scenario · every rule
   real, every volume chosen"). Do not tuck it in a footer. Being straight about
   this is a credibility gain, not a cost.

3. **Never render a bare negative.** Deductions are negative paise; show them as
   `− ₹24,000.00` in the waterfall, not `-₹24,000.00` or `(₹24,000.00)`.

4. **Every number is mono, every sentence is sans.** IBM Plex Mono for money,
   ids, timestamps and citations; IBM Plex Sans for everything else. That single
   rule is what holds the design together.

5. **`forecast.backtest.cycles === 0` is not zero error.** It means the generator
   has not been run yet. Render "accuracy not yet measured". Shipping a `±₹0`
   badge would be a lie on camera.

---

## Design system

```
bg      #0c0e11     surface  #14171c     raised   #1b1f26
border  #262b33     text     #e6e9ee     muted    #8b94a3     dim  #5d6675
positive #3fb950    warning  #d29922     negative #f85149     link #58a6ff
```

Radii 6px controls / 8px cards. Borders 1px. **No shadows, no gradients.**

Semantic use: `warning` for the closing window and for `basisVerifiable: false`
rows, `negative` only for `expired` and for a failed reconciliation, `positive`
sparingly — a reconciled waterfall is not a success state, it is the baseline.

---

## Priority, and what gets cut

1. **P0 — the explanation view.** The waterfall, citation chips, line drawer.
2. **P0 — the gap panel.** The split bar and the three missing fields.
3. P1 — report preview and the countdown.
4. P2 — forecast view.
5. **P3 — landing page. Cut it.** The deployed app is the front door.

If only 1 and 2 land, this is still a strong submission.

---

## If the contract needs to change

Message first, both of us, before the edit. It is frozen at 13:30. Then bump
`CONTRACT_VERSION`, `pnpm fixtures:build`, commit the regenerated JSON, and get
`pnpm test && pnpm verify:mock` green before pushing. CI enforces the last two.
