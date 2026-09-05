import type { Hono } from "hono";
import type { SettlementSummary } from "@assay/contract";
import type { Config } from "../config.js";
import type { Engine } from "../engine-computed.js";
import { ApiProblem, refuse, reply, type Vars } from "../envelope.js";
import { answer } from "./answer.js";

/**
 * The five settlement routes.
 *
 * Every one of them reads the clock exactly once, at the top of the handler,
 * and passes that single number down. A handler that called `now()` twice could
 * serve a summary whose `windowStatus` says "closing" beside a window whose
 * `msRemaining` says otherwise — a one-millisecond bug that reproduces once a
 * day and never in a test.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Phrased for a person: it names what was looked for, not how we looked. */
const noSuchSettlement = (id: string): string =>
  "Assay has no settlement " + id + ". Check the id against GET /v1/settlements.";

function readLimit(raw: string | undefined): number | ApiProblem {
  if (raw === undefined || raw === "") return DEFAULT_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return new ApiProblem(
      400,
      "bad_request",
      "limit must be a whole number between 1 and " + MAX_LIMIT + ".",
      "limit",
    );
  }
  return limit;
}

/**
 * The cursor is the id of the last item on the previous page — opaque to the
 * client, meaningful to us, and stable under a source that grows at the front.
 * An offset would silently skip a settlement the moment a newer cycle landed
 * between two requests.
 *
 * A cursor naming an id we do not have is a 400, not an empty page. Serving
 * `{ items: [], nextCursor: null }` there would tell a paging client it had
 * reached the end when it had in fact lost its place.
 */
function readCursor(raw: string | undefined, all: readonly SettlementSummary[]): number | ApiProblem {
  if (raw === undefined || raw === "") return 0;
  const at = all.findIndex((s) => s.id === raw);
  if (at < 0) {
    return new ApiProblem(400, "bad_request", "That cursor names no settlement in this list.", "cursor");
  }
  return at + 1;
}

export function registerSettlementRoutes(
  app: Hono<{ Variables: Vars }>,
  engine: Engine,
  config: Config,
): void {
  app.get("/v1/settlements", async (c) => {
    const now = config.now();

    const limit = readLimit(c.req.query("limit"));
    if (limit instanceof ApiProblem) return refuse(c, limit);

    const all = await engine.listSummaries(now);

    const from = readCursor(c.req.query("cursor"), all);
    if (from instanceof ApiProblem) return refuse(c, from);

    const items = all.slice(from, from + limit);
    const last = items.at(-1);
    const more = from + items.length < all.length;

    return reply(c, { items, nextCursor: more && last ? last.id : null });
  });

  app.get("/v1/settlements/:settlementId", async (c) => {
    const id = c.req.param("settlementId");
    const now = config.now();
    return answer(c, noSuchSettlement(id), () => engine.summary(id, now));
  });

  app.get("/v1/settlements/:settlementId/explanation", async (c) => {
    const id = c.req.param("settlementId");
    return answer(c, noSuchSettlement(id), () => engine.explanation(id));
  });

  app.get("/v1/settlements/:settlementId/ceiling", async (c) => {
    const id = c.req.param("settlementId");
    return answer(c, noSuchSettlement(id), () => engine.ceiling(id));
  });

  app.get("/v1/settlements/:settlementId/window", async (c) => {
    const id = c.req.param("settlementId");
    const now = config.now();
    return answer(c, noSuchSettlement(id), () => engine.window(id, now));
  });

  app.get("/v1/settlements/:settlementId/report", async (c) => {
    const id = c.req.param("settlementId");
    const now = config.now();
    return answer(c, noSuchSettlement(id), () => engine.report(id, now));
  });
}
