# WS-1 — calculator log

Append-only. Newest entry at the bottom.

### 17:45 — the aggregation level, decided before any arithmetic

`Σ bps(x_i, r)` is not `bps(Σ x_i, r)` in general — five slices each rounding half
away from zero can drift from the aggregate by a paisa or two, and a paisa is the
difference between a waterfall that closes and a refusal. I expected to have to
choose between them on rounding grounds. It turns out they agree exactly tonight,
because every slice gross is a whole number of rupees and 2% of a whole rupee
amount is exact, so nothing rounds at all.

That agreement is luck about *this* mix, not a property of the rule, so I did not
let it pick the definition. The cycle's gateway fee **is defined as**
`Σ slice.feeCharged`. The invariant "the instrument mix decomposes the fee
exactly" (W4) is then structural — it holds for any future mix, including one
where the per-slice rounding does not cancel. `bps(gross, P-01)` is asserted as a
*test* and never used as the definition. GST goes deliberately the other way: one
`bps()` call on the summed fee, because per-slice GST summed would round
differently and would not reproduce ₹4,320.

### 18:20 — `constructed` is a boolean on the way in and a literal on the way out

`RawMerchant.constructed` is `boolean`; the frozen contract's `Merchant.constructed`
is `z.literal(true)`. So `constructed: cycle.merchant.constructed` does not compile,
and the two obvious escapes — `as any` or `as const` on someone else's data — are
both banned under `apps/api/src` precisely because they turn a real question into a
silent one.

The question is real: §3.7 says every shipped merchant is constructed and the UI
must render that. So I narrowed instead of casting — read the field, refuse the
whole cycle if it is anything but `true`, and let TypeScript carry the literal from
there. A source that one day hands us a merchant claiming to be real now stops at
the calculator with a named error, rather than being quietly widened into a payload
that says "constructed: true" on a screen where it isn't.

### 18:35 — `collapsedInReport`, and the table I decided not to retype

The trap landed as warned: `card_credit` is the only Card slice in Meera's cycle,
and the obvious rule ("another slice here shares my label") reads `false` for it
while the fixture says `true`. The collapse is a property of the *label* hiding a
dimension that exists in the world — the BIN tier is just as invisible to her
whether or not `card_debit` happened to turn up this month. Derived from
`attributionOf` and not reimplemented.

The same reasoning made me drop one column of my own brief. The brief gives
`networkMdrBps` as a literal table in `instrument-mix.ts`; the seam already holds
`NETWORK_MDR_BPS` in `domain/instrument.ts`, and the ceiling stream reads that one.
Two tables of "what the network charges" is exactly the shape of the drift the
seam's README warns about with `attributionOf`: both would look internally
consistent and they would disagree by a rail. So the mix reads the seam's table and
keeps only display label, `reportedAs` and citation locally — the three things that
genuinely belong to rendering.

### 18:50 — `basisVerifiable` derived from the declared gap, not from the line id

It would have been one character to write `basisVerifiable: false` on the gateway
fee and be green. That would have made the ceiling an assertion about this fixture
rather than a measurement of any cycle: a source that *did* return the instrument
sub-type would still have been reported as unverifiable, and the ₹24,000 headline
would have been a hardcode wearing a measurement's clothes.

So there is one function, `verifiability(kind, cycle)`, that reads `cycle.gaps` and
maps the gap's `field` onto the merchant-facing sentence in `domain/copy.ts`. A line
is unverifiable exactly when it leaned on something the source declared it could not
give us. Drop `gap_instrument_sub_type` from the cycle and the gateway fee becomes
verifiable, which is the correct answer and not the fixture's.

### 19:05 — the counter is invisible to the repo's own gates

Not a rupee problem, but the one thing about tonight that will bite someone else.

`pnpm test` is `pnpm --filter @assay/contract test`, which runs
`packages/contract/src/*.test.ts` and nothing under `apps/api`. And the root
`tsconfig.json` `include` is `["packages/**/*.ts", "tools/**/*.ts",
"apps/api/src/**/*.ts"]` — `apps/api/test/**` is in neither. So `TIER-1 34/34`
never appears in `pnpm test` output, and `pnpm typecheck` does not typecheck the
file that prints it. Both scripts read green while the rupee gate is entirely
unobserved by them.

I did not fix it: `package.json` and `tsconfig.json` belong to WS-0/WS-5 and three
streams are landing test files into `apps/api/test/` at once, so a unilateral edit
to either is a merge conflict at the worst hour. Escalated instead. Verified my own
numbers by running `tsx --test apps/api/test/calculator.test.ts` directly (34/34,
9/9 tests) and by typechecking the file against the repo's exact compiler options
under a scratch `tsconfig` (clean). The fix is one line in each file and it should
be made by whoever owns the merge.
