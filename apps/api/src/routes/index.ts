import type { Hono } from "hono";
import { endpoints, type EndpointName } from "@assay/contract";
import type { Config } from "../config.js";
import type { Engine } from "../engine-computed.js";
import type { Vars } from "../envelope.js";
import { registerForecastRoute } from "./forecast.js";
import { registerHealthRoute } from "./health.js";
import { registerPolicyRoute } from "./policy.js";
import { registerSettlementRoutes } from "./settlements.js";

/**
 * Every route in the contract, mounted in one call.
 *
 * The contract's `endpoints` object is the machine-readable truth about what
 * this API answers — `tools/verify-contract.ts` iterates it, so an endpoint
 * missing from it is not part of the contract at all. `SERVED` below is this
 * file's claim about which of those it has actually mounted, and
 * `assertEveryEndpointServed` compares the two at startup.
 *
 * That check is worth its handful of lines because the failure it catches is
 * invisible otherwise: adding an endpoint to the contract and forgetting to
 * mount it produces a 404 that looks exactly like a mistyped URL, and the only
 * thing that notices is a conformance run nobody has started yet. Here it is a
 * process that will not boot, with the missing name in the message.
 */

const SERVED: ReadonlySet<EndpointName> = new Set<EndpointName>([
  "health",
  "listSettlements",
  "getSettlement",
  "getExplanation",
  "getCeiling",
  "getWindow",
  "getReport",
  "getForecast",
  "getPolicy",
]);

/** Throws at startup rather than 404-ing at request time. */
export function assertEveryEndpointServed(): void {
  const unmounted = (Object.keys(endpoints) as EndpointName[]).filter((n) => !SERVED.has(n));
  if (unmounted.length > 0) {
    throw new Error(
      "The contract defines endpoints this server does not mount: " +
        unmounted.join(", ") +
        ". Add them in apps/api/src/routes/ and list them in SERVED.",
    );
  }
}

/** The paths, in contract order, for the startup banner. */
export function servedPaths(): string[] {
  return (Object.keys(endpoints) as EndpointName[]).map(
    (n) => endpoints[n].method + " " + endpoints[n].path,
  );
}

export function registerRoutes(
  app: Hono<{ Variables: Vars }>,
  engine: Engine,
  config: Config,
): void {
  assertEveryEndpointServed();

  registerHealthRoute(app, config);
  registerSettlementRoutes(app, engine, config);
  registerForecastRoute(app, engine, config);
  registerPolicyRoute(app, engine);
}
