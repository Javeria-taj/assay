# Form answers

Plain text, written to paste straight into a textarea. No markdown — Google Forms
will not render it.

---

## Build Challenges & Technical Obstacles
### *What issues did you face while building, and how did you solve them?*

```text
The one worth leading with is that our central claim was wrong, and finding out
made the product better.

Assay's finding is that a merchant can reconcile her settlement but cannot check
it — the ₹24,000 gateway fee spans five rails with different statutory network
MDR, and three of them arrive on her report labelled identically as "UPI". We
wrote that the field distinguishing them "does not exist". When I actually read
the API docs, it does: payment.upi.payer_account_type, carrying exactly the three
values the analysis turns on. What it is missing from is the settlement recon
report, which is the artifact she actually reconciles against.

So the ceiling is not a data-availability problem, it is a placement problem. The
field exists, it is not where the decision is made, and recovering it costs one
API call per settled row — 960 of them for this cycle. That reframing survives a
reader who knows the API, and it sharpens the ask from "collect this field" to
"put payer_account_type on the recon row". I corrected it in the README, the spec
and the fixture copy. The version we had was the more flattering one, which is
why it needed checking.

Second: a verification layer that could not fail. Three invariant checks — over
four hundred lines asserting that the waterfall closes, that the ceiling's two
axes each sum to the delta, and that the missing fields partition it — were
correct, registered in a checks array, and never
executed, because the conformance runner imported only the contract and the
fixtures. pnpm verify reported a confident 10/10 for the whole project while none
of them ran. Wiring them in took it to 14/14. Then I made each one fail on
purpose against a mutated payload, and found that one of the three threw instead
of reporting when the endpoint was unreachable — and it was the first row in the
table, so a deploy that was down would have taken the whole report down with it.
A check that has never failed has never been tested.

Third, and the one that would have cost real money: "GST applies to the sum of
the fee lines" reads unambiguous and is not. Taxing the gateway fee alone gives
₹4,320; taxing every fee line gives ₹5,094. Two people implementing that sentence
would have differed by ₹774 and both would have believed they were right. I found
it by having four reviewers each try to build a different part of the system
against the frozen types before anyone wrote code. The policy line now names the
lines it taxes explicitly, rather than describing them.

Fourth, deployment. The web service would not boot. The blueprint creates both
services at once, so there is no moment to paste an API URL that does not exist
yet, and the frontend fell back to localhost. The worse half was mine: the page
had no error handling, and the service's health check is that page — so a failed
fetch did not degrade the screen, it failed the health check and killed the
deploy over a dependency that was merely slow to start. Both cross-service values
are now wired by the blueprint itself, and the page renders a refusal that names
the endpoint instead of throwing. It reproduces locally: with nothing listening,
the route returns 200 and says so.

The habit underneath all four: write down what broke while it is still broken.
docs/BUILD_LOG.md has twelve entries, and every one of these came out of it.
```

**Word count:** ~520. Trim from the bottom if the form has a limit — the deployment
paragraph is the most expendable, the sub-type one is not.
