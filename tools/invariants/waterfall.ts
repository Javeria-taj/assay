import { Explanation, buildPath, ok } from "../../packages/contract/src/contract.js";
import { formatPaise } from "../../packages/contract/src/money.js";
import type { InvariantCheck } from "./index.js";

/**
 * The signed waterfall closes, and the instrument mix decomposes the fee.
 *
 * This checks a PAYLOAD, never an implementation — it imports nothing from
 * `apps/api/src/engine/**` — so the same five checks catch a broken calculator,
 * a stale cache and a bad deploy alike, and the ceiling and report streams can
 * run it over their own output without depending on this one.
 *
 * Returns violation strings; an empty array is a pass.
 */

const envelope = ok(Explanation);

/** Every violation names the line and both numbers, so a reader need not re-derive them. */
const disagree = (what: string, a: number, b: number): string =>
  what + ": " + formatPaise(a) + " vs " + formatPaise(b);

export function checkWaterfall(e: Explanation): string[] {
  const problems: string[] = [];
  const lines = e.lines;

  /* --- W1 · the signed lines sum to net, and the reconciliation says so --- */

  const signedSum = lines
    .filter((l) => l.kind !== "net_credited")
    .reduce((a, l) => a + l.amount, 0);
  if (signedSum !== e.netCredited) {
    problems.push(disagree("W1 signed lines do not sum to netCredited", signedSum, e.netCredited));
  }
  if (e.reconciliation.delta !== 0) {
    problems.push(
      disagree(
        "W1 reconciliation.delta is not zero (computedNet vs statedNet)",
        e.reconciliation.computedNet,
        e.reconciliation.statedNet,
      ),
    );
  }
  if (e.reconciliation.ok !== true) {
    problems.push("W1 reconciliation.ok is false while an Explanation was returned");
  }

  /* --- W2 · the last line is the net marker ------------------------------- */

  const last = lines[lines.length - 1];
  if (!last) {
    problems.push("W2 the explanation carries no lines at all");
  } else {
    if (last.kind !== "net_credited") {
      problems.push("W2 last line " + last.id + ' is "' + last.kind + '", not net_credited');
    }
    if (last.amount !== 0) {
      problems.push(disagree("W2 " + last.id + " is a marker and must carry 0", last.amount, 0));
    }
    if (last.runningBalance !== e.netCredited) {
      problems.push(
        disagree(
          "W2 " + last.id + " runningBalance does not equal netCredited",
          last.runningBalance,
          e.netCredited,
        ),
      );
    }
  }

  /* --- W3 · deductions never increase the balance ------------------------- */

  const deductions = lines.slice(1, -1);
  for (let i = 1; i < deductions.length; i++) {
    const prev = deductions[i - 1];
    const cur = deductions[i];
    if (!prev || !cur) continue;
    if (cur.runningBalance > prev.runningBalance) {
      problems.push(
        disagree(
          "W3 " + cur.id + " raised the running balance above " + prev.id,
          cur.runningBalance,
          prev.runningBalance,
        ),
      );
    }
  }

  /* --- W4 · the mix decomposes gross and fee exactly ---------------------- */

  const mixGross = e.instrumentMix.reduce((a, s) => a + s.grossCaptured, 0);
  if (mixGross !== e.grossCaptured) {
    problems.push(
      disagree("W4 instrumentMix gross does not decompose grossCaptured", mixGross, e.grossCaptured),
    );
  }

  const mixFee = e.instrumentMix.reduce((a, s) => a + s.feeCharged, 0);
  const feeLine = lines.find((l) => l.kind === "gateway_fee");
  const levied = feeLine ? Math.abs(feeLine.amount) : 0;
  if (mixFee !== levied) {
    problems.push(
      disagree(
        "W4 instrumentMix fee does not decompose " + (feeLine ? feeLine.id : "the gateway fee"),
        mixFee,
        levied,
      ),
    );
  }

  /* --- W5 · everything is cited, and every unverifiable line says why ----- */

  for (const l of lines) {
    if (!l.citation.sourceId) problems.push("W5 " + l.id + " cites nothing");
    if (l.basisVerifiable === false && l.unverifiableReason === null) {
      problems.push("W5 " + l.id + " is unverifiable and names no missing field");
    }
    if (l.basisVerifiable === true && l.unverifiableReason !== null) {
      problems.push("W5 " + l.id + " is verifiable yet carries an unverifiable reason");
    }
  }

  return problems;
}

/**
 * Over the wire. Fetches the explanation, validates the envelope against the
 * frozen schema, then runs the same five checks the engine's own test runs.
 */
export const waterfallCheck: InvariantCheck = {
  name: "waterfall",
  async run(ctx) {
    const body = await ctx.fetchJson(
      buildPath("getExplanation", { settlementId: ctx.settlementId }),
    );
    const parsed = envelope.safeParse(body);
    if (!parsed.success) {
      return [
        "waterfall: the response is not a valid Explanation envelope — " +
          parsed.error.issues
            .slice(0, 6)
            .map((i) => i.path.join(".") + ": " + i.message)
            .join("; "),
      ];
    }
    return checkWaterfall(parsed.data.data);
  },
};
