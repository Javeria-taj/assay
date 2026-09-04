/**
 * Conformance checker. Points at any Assay API — the mock or the real one — and
 * asserts that every endpoint in the contract answers, and that every response
 * validates against the schema both sides import.
 *
 *   BASE=http://localhost:4317 pnpm verify
 *   BASE=https://assay-api.fly.dev TOKEN=... pnpm verify
 *
 * This is what stops the real API drifting from the mock Javeria built against.
 * It runs in CI against the mock on every push.
 */
import { endpoints, buildPath, CONTRACT_VERSION, type EndpointName } from "../packages/contract/src/contract.js";
import * as F from "../packages/contract/src/fixtures.js";

const BASE = (process.env.BASE ?? "http://localhost:4317").replace(/\/+$/, "");
const TOKEN = process.env.TOKEN ?? "";
const PARAMS = { settlementId: process.env.SETTLEMENT_ID ?? F.SETTLEMENT_ID };

type Result = { name: string; path: string; ok: boolean; ms: number; detail: string };
const results: Result[] = [];

async function check(name: EndpointName) {
  const ep = endpoints[name];
  const path = buildPath(name, PARAMS);
  const started = Date.now();
  try {
    const res = await fetch(BASE + path, {
      headers: TOKEN ? { authorization: "Bearer " + TOKEN } : {},
    });
    const ms = Date.now() - started;
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      results.push({ name, path, ok: false, ms, detail: "HTTP " + res.status + " " + JSON.stringify(json) });
      return;
    }
    const parsed = ep.response.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 6)
        .map((i) => "      " + i.path.join(".") + ": " + i.message)
        .join("\n");
      results.push({ name, path, ok: false, ms, detail: "schema mismatch\n" + issues });
      return;
    }
    results.push({ name, path, ok: true, ms, detail: "" });
  } catch (e) {
    results.push({ name, path, ok: false, ms: Date.now() - started, detail: String(e) });
  }
}

/* Beyond schema shape: the invariants that make the product true. */
async function checkInvariants() {
  const url = BASE + buildPath("getExplanation", PARAMS);
  const res = await fetch(url, { headers: TOKEN ? { authorization: "Bearer " + TOKEN } : {} });
  const body = (await res.json()) as { ok: boolean; data?: any };
  if (!body.ok || !body.data) {
    results.push({ name: "invariants", path: url, ok: false, ms: 0, detail: "no explanation to check" });
    return;
  }
  const e = body.data;
  const sum = e.lines
    .filter((l: any) => l.kind !== "net_credited")
    .reduce((a: number, l: any) => a + l.amount, 0);

  const problems: string[] = [];
  if (sum !== e.netCredited) problems.push("waterfall does not reconcile: " + sum + " != " + e.netCredited);
  if (e.reconciliation.delta !== 0) problems.push("reconciliation.delta is " + e.reconciliation.delta);
  if (e.merchantExpected - e.netCredited !== e.unexplainedGap) problems.push("unexplainedGap is inconsistent");
  for (const l of e.lines) {
    if (!l.citation?.sourceId) problems.push(l.id + " has no citation");
    if (!l.basisVerifiable && !l.unverifiableReason) problems.push(l.id + " unverifiable with no reason");
  }
  const mixGross = e.instrumentMix.reduce((a: number, s: any) => a + s.grossCaptured, 0);
  if (mixGross !== e.grossCaptured) problems.push("instrument mix does not sum to gross");

  results.push({
    name: "invariants",
    path: "explanation",
    ok: problems.length === 0,
    ms: 0,
    detail: problems.map((p) => "      " + p).join("\n"),
  });
}

async function main() {
  console.log("verifying " + BASE + " against contract " + CONTRACT_VERSION + "\n");

  for (const name of Object.keys(endpoints) as EndpointName[]) await check(name);
  await checkInvariants();

  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "  ok  " : "  FAIL";
    console.log(mark + "  " + r.name.padEnd(18) + r.path.padEnd(52) + (r.ms ? r.ms + "ms" : ""));
    if (!r.ok) {
      failed++;
      if (r.detail) console.log(r.detail);
    }
  }
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
