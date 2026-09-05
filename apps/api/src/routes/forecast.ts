import type { Hono } from "hono";
import type { Config } from "../config.js";
import type { Engine } from "../engine-computed.js";
import type { Vars } from "../envelope.js";
import { answer } from "./answer.js";

/**
 * The open cycle, run forward through the same deterministic engine.
 *
 * `asOf` is the server's clock, taken once and handed down — the forecast is a
 * statement about a moment, and a client that supplied the moment could move
 * the answer. Nothing here is a model, and `backtest.cycles === 0` must reach
 * the UI as "accuracy not yet measured" rather than as zero error; the engine
 * owns that field and this route does not touch it.
 */
export function registerForecastRoute(
  app: Hono<{ Variables: Vars }>,
  engine: Engine,
  config: Config,
): void {
  app.get("/v1/forecast/current", async (c) => {
    const asOf = config.now();
    return answer(c, "Assay has no open cycle to forecast.", () => engine.forecast(asOf));
  });
}
