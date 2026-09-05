import {
  formatPaise,
  rupees,
  type DiscrepancyReport,
  type DisputeWindow,
  type Explanation,
  type ExplanationLine,
  type LineKind,
  type Paise,
} from "@assay/contract";
import type { MissingFieldId } from "../domain/attribution.js";
import { MISSING_FIELD_COPY } from "../domain/copy.js";

/**
 * The discrepancy report, ASSEMBLED from reconciled lines rather than written.
 *
 * Every figure in the body below comes out of the `Explanation` it was handed.
 * Nothing here holds an amount, a rate or a count of its own, and nothing here
 * writes a sentence about a number it did not read off a line — because the
 * merchant sends this letter under her own name, inside a contractual window,
 * to a counterparty who will check it. A claim Assay cannot stand behind is
 * worse for her than a claim it never made.
 *
 * That is why `claims` is not a summary of the body: it IS the body's spine.
 * Each claim carries the `lineId` it restates, so the UI can cross-link every
 * rupee in the letter back to the line that produced it, and
 * `tools/invariants/report.ts` re-checks that link over the wire.
 *
 * Reference implementation to match: `F.buildReport(settledAt, now)` in
 * `packages/contract/src/fixtures.ts`.
 */

/* ------------------------------------------------------------------ layout */

/**
 * The measure the body wraps to, and the column the claim amounts sit in.
 *
 * Both are layout, not content: the body is a plain-text letter that gets
 * pasted into an email client, so it is wrapped once here at a fixed measure
 * rather than left for whatever renders it. The wrap is greedy and
 * deterministic — the same explanation always produces the same bytes.
 */
const MEASURE = 77;
const CLAIM_INDENT = "  ";
const CLAIM_AMOUNT_COLUMN = 43;
/** Never let a long statement collide with its amount; two spaces at minimum. */
const CLAIM_MIN_GUTTER = 2;

const RUPEE_SIGN = "₹";

/**
 * Indian digit grouping for a plain count, routed through the contract's own
 * money formatter — the same trick `calculate.ts` uses, so a count in the
 * letter groups identically to a count in the waterfall it quotes.
 */
const fmtCount = (n: number): string =>
  formatPaise(rupees(n), { paise: false }).replace(RUPEE_SIGN, "");

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
] as const;

/** Small counts read as words in a letter; large ones fall back to digits. */
function numberWord(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= NUMBER_WORDS.length) return fmtCount(n);
  return NUMBER_WORDS[n] ?? fmtCount(n);
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** "a", "a and b", "a, b and c". */
function listPhrase(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/** Greedy wrap at `MEASURE`. A word longer than the measure gets its own line. */
function wrap(paragraph: string): string[] {
  const out: string[] = [];
  let current = "";
  for (const word of paragraph.split(" ")) {
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= MEASURE) {
      current += " " + word;
    } else {
      out.push(current);
      current = word;
    }
  }
  if (current !== "") out.push(current);
  return out;
}

/* ----------------------------------------------------------- what is claimed */

/**
 * The kinds that are already inside the merchant's own expectation.
 *
 * `merchantExpected` is gross, less the headline rate, less refunds — so those
 * three lines plus the net marker are the ones she has already accounted for.
 * Every OTHER deduction is, by construction, a line that explains the
 * difference, which is exactly what the letter lists. Deriving the claim set
 * this way rather than naming five kinds means a cycle carrying a sixth kind
 * of charge lists it too, instead of quietly dropping it out of the letter.
 */
const INSIDE_EXPECTATION: ReadonlySet<LineKind> = new Set<LineKind>([
  "gross_captured",
  "gateway_fee",
  "refund_principal",
  "net_credited",
]);

/** The two lines that are markers rather than components of the delta. */
const MARKERS: ReadonlySet<LineKind> = new Set<LineKind>(["gross_captured", "net_credited"]);

/**
 * The two fields the letter asks for.
 *
 * This is the one editorial choice in the file, and it is a choice about what
 * to ASK for, not about what to claim: the instrument sub-type and the per-line
 * fee basis are the two fields that would let her check the fee she was
 * charged. Card BIN tier is a real gap and it is reported on the ceiling, but
 * it changes what the network takes rather than what she was billed, so a
 * discrepancy letter does not ask for it.
 *
 * The NAMES come from the seam's `MISSING_FIELD_COPY`; only the selection is
 * made here, so the letter cannot call a field something the ceiling does not.
 */
const REQUESTED_FIELDS: readonly MissingFieldId[] = ["instrument_subtype", "per_line_fee_basis"];

/* ------------------------------------------------------------- the statement */

/** "gateway_fee" -> "gateway fee". The letter names a base; the enum already has it. */
const kindPhrase = (kind: LineKind): string => kind.replace(/_/g, " ");

/** "Chargebacks (principal)" -> { head: "Chargebacks", tail: "principal" }. */
function splitParenthetical(label: string): { head: string; tail: string | null } {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(label);
  if (!m) return { head: label, tail: null };
  return { head: m[1] ?? label, tail: m[2] ?? null };
}

/**
 * ", 1,100 × ₹3" — the per-event arithmetic, when the line carries it.
 *
 * Read off `count` and `unitAmount`, which the calculator already fills for
 * exactly the lines where the charge is per-event. A letter that says
 * "Failed-payment charges ₹3,300" invites the reply "against what?"; one that
 * shows 1,100 × ₹3 does not.
 */
function quantity(line: ExplanationLine): string {
  if (line.count === null || line.unitAmount === null || line.count <= 0) return "";
  return ", " + fmtCount(line.count) + " × " + formatPaise(line.unitAmount, { paise: false });
}

function defaultStatement(line: ExplanationLine): string {
  const { head, tail } = splitParenthetical(line.label);
  return head + quantity(line) + (tail === null ? "" : " " + tail);
}

/**
 * The sentence the letter makes of one line.
 *
 * Built from the line's own label and numbers, never authored per settlement.
 * The single override is the tax line: its waterfall label reads "on the fee"
 * because on screen it sits directly beneath the fee it is levied on, and a
 * letter read on its own has no such neighbour — so the base is named. The
 * substitution is anchored to the end of the label so it cannot fire mid-
 * sentence, and it falls through to the label untouched when the explanation
 * carries no fee line to name.
 */
function claimStatement(line: ExplanationLine, explanation: Explanation): string {
  const statement = defaultStatement(line);
  if (line.kind !== "tax_on_fees") return statement;
  const base = explanation.lines.find((l) => l.kind === "gateway_fee");
  if (!base) return statement;
  return statement.replace(/\bthe fee$/, "the " + kindPhrase(base.kind));
}

/* -------------------------------------------------------------- the collapse */

type Collapse = { reportedAs: string; count: number };

/**
 * The largest set of rails the merchant's report gives one name to.
 *
 * Counted off `reportedAs` — the label she is shown — because that is what the
 * collapse IS. Returns null when no label covers more than one rail, and the
 * letter then simply does not make the claim.
 */
function largestCollapse(explanation: Explanation): Collapse | null {
  const counts = new Map<string, number>();
  for (const slice of explanation.instrumentMix) {
    counts.set(slice.reportedAs, (counts.get(slice.reportedAs) ?? 0) + 1);
  }
  let biggest: Collapse | null = null;
  for (const [reportedAs, count] of counts) {
    if (biggest === null || count > biggest.count) biggest = { reportedAs, count };
  }
  return biggest !== null && biggest.count > 1 ? biggest : null;
}

/* ------------------------------------------------------------------ the body */

type Claim = DiscrepancyReport["claims"][number];

function claimRows(claims: readonly Claim[]): string[] {
  const longest = claims.reduce((a, c) => Math.max(a, c.statement.length), 0);
  const width = Math.max(CLAIM_AMOUNT_COLUMN - CLAIM_INDENT.length, longest + CLAIM_MIN_GUTTER);
  return claims.map((c) => CLAIM_INDENT + c.statement.padEnd(width) + formatPaise(c.amount));
}

/**
 * The paragraph that names what she cannot check.
 *
 * Explicitly NOT a claim: it is the ceiling, restated in a sentence, and the
 * letter says so — "not disputed here". Assay measures; it does not accuse. The
 * amount is the sum of the lines the engine itself marked unverifiable, so a
 * cycle whose basis is fully checkable produces no such paragraph at all.
 */
function ceilingParagraph(explanation: Explanation): string | null {
  const unverifiable = explanation.lines.filter(
    (l) => !l.basisVerifiable && !MARKERS.has(l.kind) && l.amount !== 0,
  );
  if (unverifiable.length === 0) return null;

  const amount = unverifiable.reduce((a, l) => a - l.amount, 0);
  const kinds = [...new Set(unverifiable.map((l) => kindPhrase(l.kind)))];
  const collapse = largestCollapse(explanation);
  const rails = explanation.instrumentMix.length;

  const opening =
    "Separately, and not disputed here: " +
    formatPaise(amount) +
    " of " +
    listPhrase(kinds) +
    " was charged across " +
    numberWord(rails) +
    " rails carrying different statutory network MDR" +
    (collapse === null
      ? "."
      : ", " +
        numberWord(collapse.count) +
        ' of which are reported identically as "' +
        collapse.reportedAs +
        '".');

  const asking =
    " I am unable to verify the composition of that fee from any field made available to me," +
    " and would ask that the " +
    listPhrase(REQUESTED_FIELDS.map((id) => lowerFirst(MISSING_FIELD_COPY[id].name))) +
    " be included in future reports.";

  return opening + asking;
}

/* -------------------------------------------------------------- the assembly */

export function buildReport(
  explanation: Explanation,
  window: DisputeWindow,
  generatedAt: number,
): DiscrepancyReport {
  /* A letter stapled to the wrong window would quote a deadline that is not
   * hers. Refuse rather than render it. */
  if (window.settlementId !== explanation.settlementId) {
    throw new Error(
      "buildReport: the window is for " +
        window.settlementId +
        " but the explanation is for " +
        explanation.settlementId +
        ". A report may not carry another settlement's deadline.",
    );
  }

  const claims: Claim[] = explanation.lines
    .filter((l) => !INSIDE_EXPECTATION.has(l.kind) && l.amount !== 0)
    .map((l) => ({
      lineId: l.id,
      statement: claimStatement(l, explanation),
      /* Deductions are negative on a line and positive in a letter: she is
       * asking about an amount taken, not about a signed balance. */
      amount: -l.amount,
      /* The line's own citation object, carried through. Rebuilding it here
       * would put a second, drifting copy of the rule in front of her. */
      citation: l.citation,
    }));

  const disputedTotal: Paise = claims.reduce((a, c) => a + c.amount, 0);
  const notItemised = claims.filter((c) => {
    const line = explanation.lines.find((l) => l.id === c.lineId);
    return line !== undefined && !line.onMerchantReport;
  }).length;

  const windowDays = Math.round((window.deadlineAt - window.settledAt) / (24 * 60 * 60 * 1000));

  /* When the listed lines do not close the whole gap — a plan whose headline
   * rate differs from the applied one, say — the letter says how much they DO
   * account for rather than overclaiming. */
  const accountsFor =
    disputedTotal === explanation.unexplainedGap
      ? "the difference"
      : formatPaise(disputedTotal) + " of the difference";

  const paragraphs: string[] = [
    "Reporting a discrepancy on the settlement received for the " +
      explanation.cycleLabel +
      " cycle, within the " +
      numberWord(windowDays) +
      "-day window set out in the terms.",
    "",
    "Amount credited: " + formatPaise(explanation.netCredited),
    "Amount expected on the stated plan (" +
      explanation.expectationBasis +
      "): " +
      formatPaise(explanation.merchantExpected),
    "Difference: " + formatPaise(explanation.unexplainedGap),
    "",
    "The following lines account for " +
      accountsFor +
      ". Each is reconciled against the figures returned for this settlement:",
    "",
  ];

  const body: string[] = [];
  for (const p of paragraphs) {
    if (p === "") body.push("");
    else body.push(...wrap(p));
  }
  body.push(...claimRows(claims));

  if (notItemised > 0) {
    body.push("");
    body.push(
      ...wrap(
        capitalise(numberWord(notItemised)) +
          " of these " +
          numberWord(claims.length) +
          " lines are not itemised anywhere in the reports available to me, which is why" +
          " the difference was not identified at the time of credit.",
      ),
    );
  }

  const ceiling = ceilingParagraph(explanation);
  if (ceiling !== null) {
    body.push("");
    body.push(...wrap(ceiling));
  }

  body.push("");
  body.push(
    ...wrap(
      "Requesting confirmation of the " +
        numberWord(claims.length) +
        " lines above within the reporting window.",
    ),
  );

  return {
    settlementId: explanation.settlementId,
    generatedAt,
    window,
    subject:
      "Settlement discrepancy — " +
      explanation.cycleLabel +
      " cycle (" +
      explanation.settlementId +
      ")",
    body: body.join("\n"),
    claims,
    disputedTotal,
  };
}
