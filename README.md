# Assay

**Assay tells you what your settlement is actually made of.**

---

Meera runs a D2C skincare business. In August she captured **₹12,00,000** on a
flat 2% plan. She refunded **₹32,000**. So she expected **₹11,44,000** to land.

**₹11,28,918** landed.

She cannot explain **₹15,082** — about **₹1.81 lakh a year**. Here is the whole
of it, which is what Assay puts on one screen, each line citing the rule that
produced it:

| Line | Amount | Cited to | On her report? |
|---|---:|---|---|
| Gross captured | ₹12,00,000.00 | API · `payment.amount` | yes |
| Gateway fee at 2% | − ₹24,000.00 | policy `P-01` | yes, as a lump |
| Refunds issued (principal) | − ₹32,000.00 | API · `refund.amount` | yes |
| GST at 18% on the fee | − ₹4,320.00 | policy `P-02` | yes |
| Failed-payment charges, 1,100 × ₹3 | − ₹3,300.00 | policy `P-03` | **no** |
| Chargebacks, 2 × ₹2,700 principal | − ₹5,400.00 | API · `dispute.amount` | yes |
| Chargeback fees, 2 × ₹500 | − ₹1,000.00 | policy `P-04` | **no** |
| On-demand settlement fee | − ₹1,062.00 | **API · `fees` + `tax`** | **no** |
| **Actually credited** | **₹11,28,918.00** | derived | yes |

Three of the five lines that make up her ₹15,082 are not itemised anywhere she
can see. That is why she finds out at month-end.

**Her contractual right to dispute expired on day four.**

> "In case of discrepancies, You shall report to Razorpay PA regarding such
> discrepancy **within three (3) days** upon the receipt of the fund
> settlements."
> — Razorpay Terms & Conditions, Part B

Every cycle, for essentially every small merchant in India, a right they hold
lapses unused.

---

## The finding: reconciling and verifying are not the same question

The interesting number is not the ₹15,082. It is what happens when you ask a
harder question of the full ₹71,082 gross-to-net delta.

**Every rupee reconciles. 33.8% of it cannot be checked.**

|  | share | amount |
|---|---:|---:|
| Amount reconciles against the rail's own figures | **100%** | ₹71,082.00 |
| Basis is verifiable from fields the merchant is given | **66.2%** | ₹47,082.00 |
| Basis is **not** verifiable — the field does not exist | **33.8%** | ₹24,000.00 |

The unverifiable third is the gateway fee itself. It is exactly right, and Meera
has no way to know that, because it spans five rails carrying different
statutory network MDR — and three of them arrive on her report labelled
identically as **"UPI"**.

**Three fields would close the gap.** They do not overlap, and they sum to the
whole of it:

| Missing field | Would resolve | Why |
|---|---:|---|
| Instrument sub-type | ₹18,000.00 | bank UPI carries 0% network MDR by statute; RuPay-credit-on-UPI ~2%; PPI-on-UPI 1.1% above ₹2,000 — all reported as "UPI" |
| Card BIN tier | ₹4,800.00 | debit, credit, commercial and international BINs carry materially different interchange |
| Per-line fee basis | ₹1,200.00 | each line states an amount but not the base it was computed on |

And one consequence worth stating plainly, because it is invisible rather than
improper: **₹7,20,000 of Meera's August volume moved on a rail that carries zero
network MDR by statute** — UPI from a bank account, under PSSA §10A and
Income-tax Act §269SU. Under a flat 2% plan that slice still attracted
**₹14,400** of fee. Legal, disclosed in her plan, and absent from every report
she is given.

The framing throughout is *"here are the three fields that would close the
gap"* — never *"someone is hiding fees."*

---

## Where the AI is, and where it deliberately is not

**The model reads and writes English. Deterministic code touches the money.**

The model parses a rate card or T&C into a machine-checkable fee policy and
normalises heterogeneous report schemas. A human approves that policy before it
is ever used to compute a rupee — `Policy.lines[].approved` is a hard
precondition, and the API returns `policy_not_approved` rather than a number.

Every rupee of arithmetic and every pass/fail in this repo is deterministic
code, covered by tests that reproduce the table above to the rupee.

And one rule underneath that one: **rupees come from what the rail returned, not
from a rate we typed in.** The on-demand settlement fee above has no rate
anywhere in this repo. Policy line `P-05` holds
`readFromApi: "settlement.fees + settlement.tax"` and `rateBps: null`. A stale
rate on camera costs exactly as much credibility as a wrong API call.

---

## Prior art

| | What it does |
|---|---|
| **Terra Insight — TransactIG** | India, small; post-hoc enterprise fee audit |
| **Primer** | Payment orchestration with reporting |
| **Leapfin** | Revenue data / accounting automation |
| **Tally, Zoho Books** | The recon layer Indian SMBs actually use today |
| **ReconPe, Recko, Osfin** | Marketplace and payment-rail reconciliation for Indian sellers |

**None predict. None explain to a citation. None are built around the three-day
window.**

---

## Documented vs constructed

Both statements ship, and the UI says so on screen.

**Documented** — traceable to a published source: the three-day discrepancy
clause; zero network MDR on UPI-from-bank-account and RuPay debit (PSSA §10A,
Income-tax Act §269SU); GST at 18% on gateway fees; the instrument sub-type
distinctions; that the on-demand settlement response carries `fees` and `tax`
fields.

**Constructed** — Meera, her ₹12L monthly volume, her instrument mix, her flat
2% plan, the ₹3 failed-payment charge and the ₹500 chargeback fee. Chosen to
show scale at a believable Indian SMB.

**The arithmetic is correct. The merchant is not real.** Assay is
gateway-agnostic and runs on synthetic data; it is never pointed at a named
provider's real statement.

---

## Run it

```bash
pnpm install
pnpm mock        # the API, zero dependencies      → http://localhost:4317
pnpm test        # reproduces the table above, to the rupee
pnpm verify:mock # every endpoint against the shared contract
```

```bash
curl -s localhost:4317/v1/settlements/stl_2608mera01/explanation
```

## Layout

```
packages/contract/     the Zod contract both sides import, the typed client,
                       and the Meera fixture — one source of truth
tools/mock-server.mjs  zero-dependency mock API, runs on a clean clone
tools/verify-contract  conformance checker; points at the mock or the real API
apps/web/              the UI          (Javeria)
apps/api/              the real API    (Rafi)
```

- **`API_CONTRACT.md`** — conventions, endpoints, and the ten invariants the API
  must hold.
- **`FRONTEND.md`** — how to build the whole UI against the mock.

## Status

Contract, fixture, mock server and conformance checker are done and green.
The calculator, the synthetic generator, the ceiling analysis, the policy parser
and the real API are in progress.

## Licence

MIT.
