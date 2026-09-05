import { createSource, type SettlementSource } from "./sources/index.js";

/**
 * Everything the process learns from its environment, read exactly once, here.
 *
 * The rule this file exists to enforce: **nothing below the route layer reads
 * `process.env`, and nothing below the route layer reads a clock.** An engine
 * function that consults the environment is untestable at a distance — it
 * behaves differently in CI, on a laptop and in a container, and the difference
 * never shows up as a diff. An engine function that consults `Date.now()` is
 * worse: it cannot be replayed, so a settlement explained at 11:00 and the same
 * settlement explained at 11:01 are two different answers with no record of why.
 *
 * So the clock is a dependency, injected as `now()`, and a route reads it once
 * per request and hands the number down. `DisputeWindow.serverNow` is that
 * number, which is why the contract calls it *server*-now: the client is never
 * asked to guess.
 *
 * `envelope.ts` reads `ASSAY_SOURCE` once more of its own accord, because the
 * `x-assay-source` header is stamped before any config object exists. The two
 * cannot disagree: `sourceLabel` below is read off the source that was actually
 * constructed, and `createSource` builds the live source on exactly the
 * condition the header turns on.
 */

export interface Config {
  /** TCP port to bind. */
  readonly port: number;
  readonly hostname: string;
  /** Where cycles come from. Resolved at startup; never re-resolved per request. */
  readonly source: SettlementSource;
  /**
   * What `/v1/health` reports. Read off the source that was actually built, so
   * it cannot claim "live" while a synthetic generator answers the requests.
   */
  readonly sourceLabel: "mock" | "live";
  /** Exact origins CORS will echo. Empty means no browser origin is allowed. */
  readonly allowedOrigins: readonly string[];
  /** The server's clock. A route reads it once; the engine never calls it. */
  now(): number;
}

const DEFAULT_PORT = 4318;

function readPort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT is " + JSON.stringify(raw) + ", which is not a port number.");
  }
  return port;
}

/**
 * One origin in production. Localhost is added only outside it, so a deployed
 * API never answers a laptop.
 */
function readOrigins(env: NodeJS.ProcessEnv): string[] {
  const candidates = [
    env.ALLOWED_ORIGIN,
    env.NODE_ENV !== "production" ? "http://localhost:3000" : null,
  ];
  return [
    ...new Set(
      candidates
        .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
        .map((o) => o.trim().replace(/\/+$/, "")),
    ),
  ];
}

/**
 * Resolves the whole configuration, or throws.
 *
 * `createSource` is the loud failure: `ASSAY_SOURCE=live` without keys raises
 * `SourceConfigError` here, at startup, rather than serving synthetic data
 * under a live banner. That fallback is the one failure this project cannot
 * afford, so it is not available — not behind a flag, not on a retry.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const source = createSource(env);
  return {
    port: readPort(env.PORT),
    hostname: env.HOST?.trim() || "0.0.0.0",
    source,
    sourceLabel: source.kind === "live" ? "live" : "mock",
    allowedOrigins: readOrigins(env),
    now: () => Date.now(),
  };
}
