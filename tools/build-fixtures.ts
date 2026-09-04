/**
 * Generates tools/fixtures.generated.json from the typed fixtures, validating
 * every payload against the contract on the way out.
 *
 * Why generate: the mock server must run on a clean clone with `node`, no
 * install, no transpiler. Generating keeps ONE source of truth (the TypeScript)
 * and gives the mock a plain-JSON body to serve. CI regenerates and diffs, so
 * the JSON can never drift from the contract.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  Ceiling,
  CONTRACT_VERSION,
  DiscrepancyReport,
  DisputeWindow,
  Explanation,
  Forecast,
  Policy,
  SettlementSummary,
} from "../packages/contract/src/contract.js";
import * as F from "../packages/contract/src/fixtures.js";

const ANCHOR_NOW = F.FIXTURE_SETTLED_AT + 54 * 60 * 60 * 1000;

const payload = {
  contractVersion: CONTRACT_VERSION,
  generatedBy: "tools/build-fixtures.ts",
  fixtureSettledAt: F.FIXTURE_SETTLED_AT,
  anchorNow: ANCHOR_NOW,
  disputeWindowMs: F.DISPUTE_WINDOW_MS,
  closingThresholdMs: F.CLOSING_THRESHOLD_MS,
  settlementId: F.SETTLEMENT_ID,
  summary: SettlementSummary.parse(F.SUMMARY),
  explanation: Explanation.parse(F.EXPLANATION),
  ceiling: Ceiling.parse(F.CEILING),
  policy: Policy.parse(F.POLICY),
  window: DisputeWindow.parse(F.buildWindow(F.FIXTURE_SETTLED_AT, ANCHOR_NOW)),
  report: DiscrepancyReport.parse(F.buildReport(F.FIXTURE_SETTLED_AT, ANCHOR_NOW)),
  forecast: Forecast.parse(F.buildForecast(ANCHOR_NOW)),
};

const out = join(dirname(fileURLToPath(import.meta.url)), "fixtures.generated.json");
writeFileSync(out, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log("wrote " + out + " (contract " + CONTRACT_VERSION + ")");
