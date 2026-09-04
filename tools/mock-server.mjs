#!/usr/bin/env node
/**
 * Assay mock API — zero dependencies, zero install.
 *
 *   node tools/mock-server.mjs
 *
 * Serves every endpoint in the contract from the generated fixture, so the whole
 * UI can be built and demoed before a line of the real API exists. When the real
 * API lands, the web app changes ONE env var: NEXT_PUBLIC_ASSAY_API.
 *
 * Env:
 *   PORT=4317                     port
 *   ASSAY_MOCK_WINDOW=closing     open | closing | expired | fixed
 *                                 how much of the 3-day window is left.
 *                                 `fixed` freezes the clock at the generated
 *                                 anchor, for deterministic snapshots.
 *   ASSAY_MOCK_LATENCY_MS=0       delay every response, for loading states
 *   ASSAY_MOCK_FAIL=              comma-separated endpoint names to fail,
 *                                 for error states. e.g. getCeiling
 *   ASSAY_MOCK_EMPTY=0            1 = serve an empty settlement list
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(readFileSync(join(HERE, "fixtures.generated.json"), "utf8"));

const PORT = Number(process.env.PORT ?? 4317);
const LATENCY = Number(process.env.ASSAY_MOCK_LATENCY_MS ?? 0);
const WINDOW_MODE = process.env.ASSAY_MOCK_WINDOW ?? "closing";
const FAIL = new Set((process.env.ASSAY_MOCK_FAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const EMPTY = process.env.ASSAY_MOCK_EMPTY === "1";

const DAY = 86_400_000;

/** Where the clock sits relative to settlement, per ASSAY_MOCK_WINDOW. */
function clock() {
  const now = Date.now();
  switch (WINDOW_MODE) {
    case "fixed":
      return { now: FIX.anchorNow, settledAt: FIX.fixtureSettledAt };
    case "open":
      return { now, settledAt: now - 6 * 3_600_000 };
    case "expired":
      return { now, settledAt: now - 5 * DAY };
    case "closing":
    default:
      return { now, settledAt: now - 54 * 3_600_000 };
  }
}

function windowStatus(msRemaining) {
  if (msRemaining <= 0) return "expired";
  if (msRemaining <= FIX.closingThresholdMs) return "closing";
  return "open";
}

function buildWindow() {
  const { now, settledAt } = clock();
  const deadlineAt = settledAt + FIX.disputeWindowMs;
  const msRemaining = deadlineAt - now;
  return {
    ...FIX.window,
    settledAt,
    deadlineAt,
    serverNow: now,
    msRemaining,
    status: windowStatus(msRemaining),
  };
}

const routes = [
  {
    name: "health",
    re: /^\/v1\/health$/,
    body: () => ({
      status: "ok",
      contractVersion: FIX.contractVersion,
      source: "mock",
      serverNow: clock().now,
    }),
  },
  {
    name: "listSettlements",
    re: /^\/v1\/settlements$/,
    body: () => {
      if (EMPTY) return { items: [], nextCursor: null };
      const w = buildWindow();
      return {
        items: [{ ...FIX.summary, settledAt: w.settledAt, windowStatus: w.status }],
        nextCursor: null,
      };
    },
  },
  {
    name: "getSettlement",
    re: /^\/v1\/settlements\/([^/]+)$/,
    body: (id) => {
      if (id !== FIX.settlementId) return null;
      const w = buildWindow();
      return { ...FIX.summary, settledAt: w.settledAt, windowStatus: w.status };
    },
  },
  {
    name: "getExplanation",
    re: /^\/v1\/settlements\/([^/]+)\/explanation$/,
    body: (id) => (id !== FIX.settlementId ? null : { ...FIX.explanation, settledAt: buildWindow().settledAt }),
  },
  {
    name: "getCeiling",
    re: /^\/v1\/settlements\/([^/]+)\/ceiling$/,
    body: (id) => (id !== FIX.settlementId ? null : FIX.ceiling),
  },
  {
    name: "getWindow",
    re: /^\/v1\/settlements\/([^/]+)\/window$/,
    body: (id) => (id !== FIX.settlementId ? null : buildWindow()),
  },
  {
    name: "getReport",
    re: /^\/v1\/settlements\/([^/]+)\/report$/,
    body: (id) =>
      id !== FIX.settlementId ? null : { ...FIX.report, generatedAt: clock().now, window: buildWindow() },
  },
  {
    name: "getForecast",
    re: /^\/v1\/forecast\/current$/,
    body: () => ({ ...FIX.forecast, asOf: clock().now }),
  },
  { name: "getPolicy", re: /^\/v1\/policy$/, body: () => FIX.policy },
];

function send(res, status, payload) {
  const text = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,OPTIONS",
    "x-assay-source": "mock",
    "x-assay-contract": FIX.contractVersion,
  });
  res.end(text);
}

const server = createServer((req, res) => {
  const requestId = "req_" + randomUUID().slice(0, 12);
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "GET") {
    return send(res, 405, {
      ok: false,
      error: { code: "bad_request", message: "Assay is read-only. Only GET is served.", field: null },
      requestId,
    });
  }

  const finish = () => {
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;

      if (FAIL.has(r.name)) {
        return send(res, 500, {
          ok: false,
          error: { code: "internal", message: "Injected failure for " + r.name + " (ASSAY_MOCK_FAIL).", field: null },
          requestId,
        });
      }

      const data = r.body(m[1]);
      if (data === null) {
        return send(res, 404, {
          ok: false,
          error: { code: "not_found", message: "No settlement " + m[1] + ".", field: null },
          requestId,
        });
      }
      return send(res, 200, { ok: true, data, requestId });
    }

    return send(res, 404, {
      ok: false,
      error: { code: "not_found", message: "No route for " + path + ".", field: null },
      requestId,
    });
  };

  if (LATENCY > 0) setTimeout(finish, LATENCY);
  else finish();
});

server.listen(PORT, () => {
  const w = buildWindow();
  const hrs = Math.round(w.msRemaining / 3_600_000);
  console.log("assay mock  ·  http://localhost:" + PORT + "  ·  contract " + FIX.contractVersion);
  console.log("  settlement " + FIX.settlementId + "  ·  window " + w.status + ", " + hrs + "h remaining");
  console.log("  GET /v1/settlements/" + FIX.settlementId + "/explanation");
  if (LATENCY) console.log("  latency " + LATENCY + "ms");
  if (FAIL.size) console.log("  failing: " + [...FAIL].join(", "));
});
