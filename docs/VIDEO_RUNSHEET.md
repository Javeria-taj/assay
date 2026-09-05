# Assay — single-take run sheet

**Audio and picture recorded together, one pass, 5:00.**

Read this on a second screen or on paper. `SAY` is verbatim. `DO` is the action
and *when* it happens relative to the words. `— pause —` is a real silence: stop
talking, let the frame settle, count it.

The rule that makes a live take work: **never scroll while saying a number.** The
figure has to be still on screen while the viewer hears it. Move, stop, speak —
in that order, every time.

---

## Sixty seconds before you hit record

1. Open both pages once to warm the deploy. Cold start regenerates six cycles
   from the seed and costs ten seconds; warm is a tenth of a second.
   - <https://assay-web.onrender.com/>
   - <https://assay-web.onrender.com/s/stl_2608mera01>
2. Go back to the landing page. `⌘⇧R` hard reload. Scroll to the very top.
3. Confirm the console's window strip reads **closing** and the countdown is
   moving, and the demo chip bottom-right reads `state · live`.
4. Focus on. Dock hidden. Menu bar hidden. Slack quit. Phone face down.
5. Zoom 110–125%. One tab. No bookmarks bar.
6. `⌘⇧5` → record **the window**, mic **on**, **Show Mouse Clicks off**.
7. Take one breath. Start recording. Wait three seconds of silence before the
   first word — you will want that handle when you trim.

---

## The six cut points

A five-minute live take with fifteen actions is genuinely hard, and you do not
need it to be one unbroken run. At each `▣ CUT POINT` below the screen is static
and you are silent — a hard cut there is invisible.

**So: run it continuously, but if you fluff a line, stop, go back to the last cut
point, and start again from there.** You keep everything before it. A mistake
costs one segment, not five minutes.

---

# SEGMENT 1 · the thesis · 0:00–0:22

**SCREEN:** landing page, top, still.

— pause, 3 seconds, silence —

> **SAY:** A payment gateway credits a merchant ₹11,28,918.

— pause —

> **SAY:** She expected ₹11,44,000. Her gross, minus the two percent she was
> quoted, minus her refunds.

**DO:** one slow scroll — a single deliberate two-finger push, about one screen —
then stop.

> **SAY:** The settlement report tells her what landed. It does not tell her how.

— pause, 2 seconds —

**▣ CUT POINT 1**

---

# SEGMENT 2 · into the product · 0:22–0:52

**DO:** move the cursor to `Explore Assay` and click it. The console loads. Do not
speak until the verdict figures are on screen.

> **SAY:** This is Assay. One settlement, taken apart.

— pause —

> **SAY:** ₹12,00,000 captured. ₹11,28,918 credited.

**DO:** nothing. Let the three figures sit.

> **SAY:** She cannot account for ₹15,082 of that — inside a total gap of
> ₹71,082.
>
> And she has three working days to dispute it. That is Razorpay's own term,
> Part B. After that the entry is final.

— pause, 2 seconds —

**▣ CUT POINT 2**

---

# SEGMENT 3 · the trace · 0:52–2:20

The longest segment and the one that earns the rest.

**DO:** scroll down until the trace header and the first three lines are visible.
Stop.

> **SAY:** Nine lines, gross to net. Every one is derived, and every one says
> where its number came from.

**DO:** scroll one small push. Gateway fee row visible. Stop.

> **SAY:** Gateway fee, ₹24,000 — two percent of gross, off the rate card.

**DO:** scroll one small push. Refunds and GST visible. Stop.

> **SAY:** Refunds, ₹32,000. GST on the fee, ₹4,320 — eighteen percent, statute.

**DO:** scroll one small push. Failed-payment row visible. Stop.

> **SAY:** Failed attempts — eleven hundred of them, at three rupees each.
> ₹3,300.

— pause —

> **SAY:** She has never seen this line. A failed attempt never settles, so no
> settlement report can contain one.

**DO:** scroll one small push. Chargeback rows visible. Stop.

> **SAY:** Two chargebacks. ₹5,400 in principal, ₹1,000 in fees.

**DO:** scroll one small push. The on-demand settlement fee row visible. Stop.

> **SAY:** And the on-demand settlement fee. ₹1,062.

**DO:** **click that row.** The drawer opens from the right. Wait for it to settle
before speaking.

> **SAY:** There is no on-demand rate anywhere in this codebase.

— pause —

> **SAY:** The policy line says: read `settlement.fees` plus `settlement.tax` off
> the response. Rate — null.
>
> If we do not know a rate, we do not infer one. We read it, and the line says we
> read it.

**DO:** nothing. Hold on the drawer. **This is the most important frame in the
video.**

> **SAY:** Every citation carries a kind. A field from the rail. A policy line a
> human approved. A statute. Or arithmetic we did ourselves.

**DO:** press **Escape**. The drawer closes.

> **SAY:** Click any line, and you land on the rule that produced it.
>
> ₹11,28,918. To the paise.

— pause, 2 seconds —

**▣ CUT POINT 3**

---

# SEGMENT 4 · the ceiling · 2:20–3:20

The intellectual core. If a panel remembers one minute, it is this one.
**Do not click anything in this segment.** The cursor should not move — a moving
cursor competes with the narration.

**SCREEN:** the ceiling panel is already beside the trace. If it is not fully in
frame, one small scroll, then stop and leave the mouse alone.

> **SAY:** So the delta reconciles. All of it. A hundred percent.

— pause —

> **SAY:** Now the harder question. How much of it can she *check*?

— pause, 2 seconds —

> **SAY:** Sixty-six point two four percent. ₹47,082 she can verify against
> fields she was actually handed.
>
> The other third — ₹24,000, the gateway fee itself — she cannot.

— pause —

> **SAY:** That fee ran over five rails. Three of them reach her report labelled
> identically: UPI. Bank account, RuPay credit, wallet PPI. Different statutory
> MDR, one word.

— pause —

> **SAY:** The field that separates them exists on the payment entity. It is not
> on the report she is given. Missing from the report, not from the rail.

— pause —

> **SAY:** Three named fields close the gap. Instrument sub-type, ₹18,000. Card
> BIN tier, ₹4,800. Per-line fee basis, ₹1,200.
>
> They do not overlap, and they sum to exactly ₹24,000.

**DO:** scroll down until the zero-MDR chain at the foot of the trace is fully
visible — the four steps, ₹7,20,000 through ₹14,400. Stop.

> **SAY:** And one number that appears on no report she is given.
>
> ₹7,20,000 of that gross moved on a rail the law prices at zero MDR. Under a
> flat two percent plan, it still attracted ₹14,400 of fee. Annualised,
> ₹1,72,800.
>
> Legal, disclosed in her plan, and invisible.

— pause, 2 seconds —

**▣ CUT POINT 4**

---

# SEGMENT 5 · the window and the letter · 3:20–4:10

**DO:** scroll back up to the window strip. Stop. Let the countdown tick visibly
for two seconds before speaking.

> **SAY:** All of this is time-boxed. This countdown runs off the server's clock,
> never the browser's — a wrong countdown on a dispute deadline is worse than no
> countdown at all.

**DO:** click the demo chip at the bottom right, then click **expired**. The strip
turns. Wait for it.

> **SAY:** And this is what the product is actually for.

— pause —

> **SAY:** The window closed. The right lapsed, unused — the way it does every
> cycle, for essentially every small merchant in India.

**DO:** click the demo chip again, choose **closing**. Then click **Prepare
discrepancy report**. The sheet opens.

> **SAY:** This is what she sends. Every line she is disputing, the citation
> behind it, and the two fields she is asking for by name.

**DO:** one slow scroll inside the sheet. Stop.

> **SAY:** Copy, or download. Assay does not send it, and Assay never moves
> money. The entire API is GET-only. It reads, it explains, and it hands her the
> letter.

**DO:** press **Escape**. The sheet closes.

— pause, 2 seconds —

**▣ CUT POINT 5**

---

# SEGMENT 6 · honest limits · 4:10–4:40

Do not soften this and do not speed up through it. This segment is worth more
than the demo.

**SCREEN:** the full console, still. No cursor movement, no scrolling.

> **SAY:** What it does not do.

— pause —

> **SAY:** The cycle is synthetic and seeded — reproducible from one number. The
> live Razorpay adapter is written and committed, but it has never run against
> real keys.

— pause —

> **SAY:** On the live path, failed attempts stay at zero, because no recon
> report can ever contain one. I would rather return a zero than a plausible
> number.

— pause —

> **SAY:** Recovering the instrument sub-type means nine hundred and sixty extra
> API calls, one per settled row. I have not paid that cost.
>
> Where the rail cannot answer, the cycle carries a named gap — the field, where
> we looked, and how many rows it hits — instead of a guess.

— pause, 2 seconds —

**▣ CUT POINT 6**

---

# SEGMENT 7 · the close · 4:40–5:00

**SCREEN:** stay on the console. Do not navigate back to the landing page — it is
a scroll and a load you do not need, and the console is the stronger last frame.

> **SAY:** Reconciling and verifying are two different questions. A settlement
> report that answers only the first is not enough to dispute anything in three
> days.

— pause —

> **SAY:** Every rupee reconciles. ₹24,000 of it she has no way to check.
>
> Assay names which ₹24,000, and exactly which three fields would close it.

— pause —

> **SAY:** It is live, and the source is public.

**DO:** stop talking. Hold the frame, silent, for four seconds. Then stop the
recording.

**In post:** cut to a static end card for the final six seconds —

```
assay-web.onrender.com
github.com/Javeria-taj/assay
```

Large, static, no animation, no music, held in silence. It is the only card in
the video and it belongs at the end. Do not say "thank you for watching."

---

# IF SOMETHING GOES WRONG MID-TAKE

| Problem | What to do |
|---|---|
| You fluff a word | Stop. Go to the last cut point. Re-run from there. |
| The drawer will not close | Click the dark area outside it. Escape also works. |
| The page is slow on first load | You skipped the warm-up. Stop, load both pages, start again. |
| The countdown shows `expired` at the start | The demo chip is stuck. Click it, choose `live`, reload. |
| A number on screen disagrees with the script | **Stop recording.** Fix the script, not the screen. The screen is the evidence. |

---

# THE FIGURES, TO SAY THE SAME WAY EVERY TIME

| On screen | Say |
|---|---|
| ₹12,00,000 | twelve lakh |
| ₹11,28,918 | eleven lakh twenty-eight thousand nine hundred eighteen |
| ₹11,44,000 | eleven lakh forty-four thousand |
| ₹15,082 | fifteen thousand and eighty-two |
| ₹71,082 | seventy-one thousand and eighty-two |
| ₹24,000 | twenty-four thousand |
| ₹47,082 | forty-seven thousand and eighty-two |
| 66.24% | sixty-six point two four percent |
| ₹7,20,000 | seven lakh twenty thousand |
| ₹14,400 | fourteen thousand four hundred |
| ₹1,72,800 | one lakh seventy-two thousand eight hundred |

Say each one the same way every time it recurs. Inconsistency is what makes a
viewer stop trusting the numbers.
