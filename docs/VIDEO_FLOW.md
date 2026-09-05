# Assay — final video flow

**5:00. Recorded against the live deployment.**
Supersedes `ASSAY_VIDEO.md`, which was written before the landing page existed
and before anything was deployed. Every figure below was checked against the
running system, not against the script it came from.

---

## The decision: landing is the thesis, console is the proof

The landing page and the console tell the same story, and only one of them is a
running system. The landing page is a rendering of the committed fixture — it is
the argument, made cinematically. The console computes.

So the landing page opens and closes the video, and everything in between is the
console. Roughly 45 seconds of landing, 3 minutes 45 of product, 30 seconds of
limits and end card.

The temptation is to spend two minutes on the scroll sequence because it looks
expensive. Resist it: a panel scores the system, and every second of animation is
a second not spent on evidence. The landing page earns its place by stating the
thesis in one frame — *"Your settlement arrived. ₹11,28,918.00. But the number
isn't the explanation."* — which would otherwise cost you thirty seconds of
narration.

**The transition between them is a real click, not a cut.** `Explore Assay` on
the landing page navigates to `/s/stl_2608mera01`. Use it. A visible navigation
is evidence that these are one system.

---

## Live URLs

| | |
|---|---|
| Landing | <https://assay-web.onrender.com/> |
| Console | <https://assay-web.onrender.com/s/stl_2608mera01> |
| API health | <https://assay-api-yrs6.onrender.com/v1/health> |
| Repo | <https://github.com/Javeria-taj/assay> |

**Load both pages once before recording.** The first request after an idle period
regenerates six cycles from the seed and takes about ten seconds; every request
after that is ~100 ms. Ten dead seconds on camera is the single most avoidable
mistake here.

---

# THE SCRIPT

`SCREEN` is what is recorded. `SAY` is verbatim voiceover. `[bracketed]` is an
on-screen action, not spoken. ~700 words at 140 wpm.

---

## Beat 0 · 0:00–0:25 — the thesis

No title card, no logo, no introduction. Open on the landing hero.

**SCREEN:** landing page at top, held still for three seconds. Then one slow
scroll through the first chapter and stop.

**SAY:**

> A payment gateway credits a merchant ₹11,28,918.
>
> She expected ₹11,44,000 — her gross, minus the two percent she was quoted,
> minus her refunds.
>
> The settlement report tells her what landed. It does not tell her how.

*(41 words)*

---

## Beat 1 · 0:25–0:55 — into the product

**SCREEN:** click `Explore Assay`. The console loads. Hold on the verdict header
and the window strip. Cursor still.

**SAY:**

> This is Assay. One settlement, taken apart.
>
> ₹12,00,000 captured. ₹11,28,918 credited. She cannot account for ₹15,082 of
> that, inside a total gap of ₹71,082.
>
> And she has three working days to dispute it — Razorpay's own term, Part B —
> after which the entry is final.

*(56 words)*

---

## Beat 2 · 0:55–2:20 — the trace, line by line

The longest beat and the one that earns the rest. Scroll slowly enough to read a
line, fast enough that ninety seconds covers nine lines and one drawer.

**SCREEN:** scroll into the trace. Let each named line be fully visible as it is
named. At *"Open it"*, click the on-demand settlement fee row. Hold on the drawer
while the policy line is read — **this is the most important frame in the video.**

**SAY:**

> Nine lines, gross to net. Every one is derived, and every one says where its
> number came from.
>
> Gateway fee, ₹24,000 — two percent of gross, off the rate card.
>
> Refunds, ₹32,000. GST on the fee, ₹4,320 — eighteen percent, statute.
>
> Failed attempts: eleven hundred at three rupees each, ₹3,300. She has never
> seen this line, because a failed attempt never settles — so no settlement
> report can contain one.
>
> Two chargebacks: ₹5,400 in principal, ₹1,000 in fees.
>
> And the on-demand settlement fee. ₹1,062. `[open the drawer]`
>
> There is no on-demand rate anywhere in this codebase. The policy line says:
> read `settlement.fees` plus `settlement.tax` off the response. Rate — null. If
> we do not know a rate, we do not infer one. We read it, and the line says we
> read it.
>
> Every citation carries a kind: a field from the rail, a policy line a human
> approved, a statute, or arithmetic we did ourselves. Click any line and you
> land on the rule that produced it.
>
> ₹11,28,918. To the paise.

*(198 words)*

---

## Beat 3 · 2:20–3:20 — the ceiling

The intellectual core. If a panel remembers one minute, it is this one. **Do not
click anything during this beat** — the narration is doing the work and a moving
cursor competes with it.

**SCREEN:** close the drawer. The ceiling panel is already beside the trace — no
scrolling needed for the two bars. Then scroll down so the zero-MDR chain at the
foot of the trace is fully visible for the last two sentences.

**SAY:**

> So the delta reconciles. All of it. A hundred percent.
>
> Now the harder question — how much of it can she *check*?
>
> Sixty-six point two four percent. ₹47,082 she can verify against fields she was
> actually handed. The other third — ₹24,000, the gateway fee itself — she
> cannot.
>
> That fee ran over five rails. Three of them reach her report labelled
> identically: UPI. Bank account, RuPay credit, wallet PPI — different statutory
> MDR, one word. The field that separates them exists on the payment entity. It
> is not on the report she is given. Missing from the report, not from the rail.
>
> Three named fields close the gap. Instrument sub-type, ₹18,000. Card BIN tier,
> ₹4,800. Per-line fee basis, ₹1,200. They do not overlap, and they sum to
> exactly ₹24,000.
>
> `[scroll to the zero-MDR chain]` And one number that appears on no report she
> is given: ₹7,20,000 of that gross moved on a rail the law prices at zero MDR.
> Under a flat two percent plan, it still attracted ₹14,400. Annualised,
> ₹1,72,800. Legal, disclosed in her plan, and invisible.

*(191 words)*

---

## Beat 4 · 3:20–4:05 — the window and the letter

**SCREEN:** scroll up to the window strip. Hold two seconds so the countdown
visibly moves. `[demo switcher → expired]` — hold on the expired state. Then
switch back to `closing` and open the report sheet. Scroll the preview once.

**SAY:**

> All of this is time-boxed. This countdown runs off the server's clock, never
> the browser's — a wrong countdown on a dispute deadline is worse than no
> countdown.
>
> `[switch to expired]` And this is what the product is actually for. The window
> closed. The right lapsed, unused, the way it does every cycle for essentially
> every small merchant in India.
>
> `[open the report]` This is what she sends. Every line she is disputing, the
> citation behind it, and the two fields she is asking for by name. Copy, or
> download.
>
> Assay does not send it, and Assay never moves money. The entire API is GET-only.
> It reads, it explains, and it hands her the letter.

*(118 words)*

---

## Beat 5 · 4:05–4:35 — honest limits

Do not soften this and do not speed up. This beat is worth more than the demo.

**SCREEN:** close the overlay. Hold on the full console. Holding on the product
reads as confidence; cutting to a README reads as a disclaimer slide.

**SAY:**

> What it does not do. The cycle is synthetic and seeded — reproducible from one
> number. The live Razorpay adapter is written and committed, but it has never
> run against real keys.
>
> On the live path, failed attempts stay at zero, because no recon report can
> ever contain one — and I would rather return a zero than a plausible number.
>
> Recovering the instrument sub-type means nine hundred and sixty extra API
> calls, one per settled row. I have not paid that cost. Where the rail cannot
> answer, the cycle carries a named gap — the field, where we looked, and how
> many rows it hits — instead of a guess.

*(112 words)*

---

## Beat 6 · 4:35–5:00 — the close

**SCREEN:** the landing page's final chapter, `See what your settlement is made
of.` Then the end card: live URL and repo URL, large, static, held for the last
six seconds. This is the only card in the video and it belongs at the end.

**SAY:**

> Reconciling and verifying are two different questions. A settlement report that
> answers only the first is not enough to dispute anything in three days.
>
> Every rupee reconciles. ₹24,000 of it she has no way to check. Assay names
> which ₹24,000, and exactly which three fields would close it.
>
> It is live, and the source is public.

*(63 words)*

Let the card sit in silence for the final four seconds. Do not say "thank you for
watching."

---

# WHAT MUST BE TRUE ON SCREEN

Checked against the live deployment.

| # | State | Beat | Verified |
|---|---|---|---|
| S1 | Landing hero, ₹11,28,918 | 0 | ✓ |
| S2 | Console verdict: 12,00,000 / 11,28,918 / 11,44,000 / 15,082 / 71,082 | 1 | ✓ |
| S3 | Nine trace lines, signs and citation chips | 2 | ✓ |
| S4 | Drawer on the on-demand row: `readFromApi`, rate null | 2 | ✓ |
| S5 | Ceiling: 66.24 / 33.76, three fields 18,000 / 4,800 / 1,200 | 3 | ✓ |
| S6 | Zero-MDR chain: 7,20,000 → 0 bps → 2.00% → 14,400 | 3 | ✓ |
| S7 | Countdown ticking off `serverNow` | 4 | ✓ |
| S8 | Expired state via the demo switcher | 4 | ✓ |
| S9 | Report sheet: 5 claims, ₹15,082 disputed | 4 | ✓ |
| S10 | End card, URLs typo-free | 6 | yours to make |

**Two corrections carried forward from the old script.** The zero-MDR figures are
*not* in the report sheet — they are at the foot of the trace, which is why Beat 3
ends there and Beat 4 does not mention them. And the window state on load is
`closing`, not `open`; the demo switcher moves the clock, never the data.

---

# RECORDING ON A MAC

## Before anything

```
System Settings → Focus → Do Not Disturb → on
System Settings → Desktop & Dock → "Automatically hide and show the Dock" → on
System Settings → Desktop & Dock → "Automatically hide and show the menu bar" → Always
```

Quit Slack, Mail and Messages — quit, not mute. Phone face down, silent.

## The browser

A fresh Chrome profile is the fastest way to get a clean frame:
`Chrome → Profiles → Add → continue without an account`. No bookmarks bar, no
extensions, one tab.

- `⌘⇧B` hides the bookmarks bar if you use your normal profile.
- Zoom to **110–125%** (`⌘+`). A trace line must be legible on a phone.
- Load both pages once to warm the deploy, then hard-reload (`⌘⇧R`) before the take.

## Capture

**QuickTime is enough and it is already installed.**

```
QuickTime Player → File → New Screen Recording → record the window, not the display
```

Record the browser window rather than the full screen: it crops the desktop out
for free and keeps the file small. macOS's own `⌘⇧5` overlay does the same and
lets you pick the window with one click.

Two settings that matter:

- **Turn the microphone OFF for the picture passes.** Record picture silent.
- In `⌘⇧5 → Options`, set **Show Mouse Clicks → off**. Click rings look like a
  tutorial, not a product.

## Record picture silent, then voice

This is the single biggest time-saver under a deadline: you stop needing a take
where the click and the sentence land together.

| Pass | Action | Target |
|---|---|---|
| P1 | Landing hero, hold, one slow scroll | 0:30 |
| P2 | Click `Explore Assay`, console loads, hold on verdict | 0:35 |
| P3 | Slow scroll through nine lines, open drawer, hold, close | 1:35 |
| P4 | Ceiling panel, hold, scroll to the zero-MDR chain | 1:05 |
| P5 | Window strip, demo switcher → expired, back to closing, report sheet | 0:50 |
| P6 | Close overlay, hold on the full console | 0:35 |
| P7 | Landing final chapter, then end card | 0:30 |

Do each pass twice. The second take is almost always the usable one.

## Voice

Record audio **separately** on your phone's Voice Memos, held a fist's width from
your mouth, in a room with soft furnishing. This beats a laptop mic every time and
costs nothing.

Record beat by beat, not in one run — a fluffed word costs you one beat, not five
minutes. Read at 140 wpm, slower than feels natural. Pause a full beat at every
paragraph break. Say every rupee figure the same way each time it recurs.

Do two clean takes of **Beat 3** and **Beat 5** specifically. Those two carry the
submission.

## Assemble

iMovie is on the machine and is sufficient.

1. Lay the seven audio beats down first, in order, with the pauses intact. That
   is now your clock.
2. Drop the picture passes underneath and trim picture to fit audio. Picture
   bends; narration does not.
3. Where a pass runs short, **hold the last frame** rather than speeding up a
   scroll.
4. **No music.** Finance tooling with a soundtrack reads as a pitch, not a build.
5. No transitions. Hard cuts only.
6. Watch it once end to end on a phone with the sound low. That is how it will
   actually be watched.

## Ship

- Export **1080p, H.264, ~30 fps**, under 500 MB.
- `assay-javeria-taj-razorpay-buildathon.mp4`
- YouTube → **Unlisted**, not Private. Private is the classic submission-killer.
- **Open the final link in an incognito window and watch thirty seconds.** More
  submissions die here than anywhere else.

---

## Cut order if the clock wins

Never cut Beat 1, Beat 3 or Beat 5 — the number, the ceiling, the honest limits.

1. The landing scroll in Beat 0 — hold on the hero alone.
2. The report-sheet scroll in Beat 4 — hold one frame of the preview.
3. Second takes.
4. Beat 4's window strip down to a four-second hold.
5. Beat 6's landing chapter — go straight to the end card.

## Before you film

**Say the numbers out loud once, against the screen.** If any figure disagrees
with the script by a rupee, fix the script — the screen is the evidence and the
panel will pause on it.

**Beat 5 is where a panel starts asking questions.** Be ready to answer, live and
unaided: why `failedAttemptCount` stays at zero, why `reportedAs` and not
`citation.sourceId` is the attribution key, and why there is no database. All
three are argued in `docs/adr/` and `docs/BUILD_LOG.md`.
