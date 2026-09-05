import type { Hono } from "hono";
import { CONTRACT_VERSION, Health } from "@assay/contract";
import type { Config } from "../config.js";
import { reply, type Vars } from "../envelope.js";

/**
 * The liveness probe, and rather more than one.
 *
 * `source` is the load-bearing field. `tools/invariants/cross-cycle.ts` reads
 * it over the wire to decide whether a one-settlement list is acceptable, so a
 * deployment that claimed "mock" while serving live data would switch off a
 * real check. It is read off the source that was actually constructed — see
 * `config.ts` — and never off an environment variable a route could
 * misinterpret.
 */
export function registerHealthRoute(app: Hono<{ Variables: Vars }>, config: Config): void {
  app.get("/v1/health", (c) => {
    /* Validated against the contract before it is sent: the API holds itself to
     * the same schema the web app parses with. */
    const health = Health.parse({
      status: "ok",
      contractVersion: CONTRACT_VERSION,
      source: config.sourceLabel,
      serverNow: config.now(),
    });
    return reply(c, health);
  });
}
