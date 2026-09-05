import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { CONTRACT_VERSION } from "@assay/contract";
import { loadConfig } from "./config.js";
import { createEngine } from "./engine-computed.js";
import { ApiProblem, envelope, onError, refuse, type Vars } from "./envelope.js";
import { registerRoutes, servedPaths } from "./routes/index.js";
import { SourceConfigError } from "./sources/index.js";

/**
 * The Assay API.
 *
 * Read-only by construction: every endpoint is a GET, and anything else is
 * refused before it reaches a route. All nine contract endpoints are served
 * here; `routes/index.ts` proves that against the contract's own `endpoints`
 * object at startup rather than trusting this comment.
 *
 * This file is assembly only. It reads no environment variable of its own
 * (`config.ts` does), computes no rupee (`engine/**` does), and shapes no
 * response (`envelope.ts` does).
 */

/* Resolved before the server binds a port. A source that cannot be read is a
 * refusal to start, not a request-time surprise. */
const config = (() => {
  try {
    return loadConfig();
  } catch (e) {
    if (e instanceof SourceConfigError) {
      console.error("\n[assay:api] " + e.message + "\n");
      process.exit(1);
    }
    throw e;
  }
})();

const engine = createEngine(config.source);

const app = new Hono<{ Variables: Vars }>();
app.onError(onError);

/* CORS sits outside the envelope so that it decorates the finished response,
 * refusals included. */
app.use(
  "*",
  cors({
    origin: (origin) =>
      config.allowedOrigins.includes(origin.replace(/\/+$/, "")) ? origin : null,
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["authorization", "content-type"],
    maxAge: 86_400,
  }),
);

app.use("*", envelope);

/* Assay never moves money. The method guard is the structural version of that. */
app.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "OPTIONS") {
    return refuse(c, new ApiProblem(405, "bad_request", "Assay is read-only. Only GET is served."));
  }
  await next();
});

/* -------------------------------------------------------------- endpoints */

registerRoutes(app, engine, config);

/* Last route: matches only what nothing above matched. */
app.all("*", (c) => {
  const path = new URL(c.req.url).pathname;
  return refuse(c, new ApiProblem(404, "not_found", "No route for " + path + "."));
});

/* ----------------------------------------------------------------- listen */

serve({ fetch: app.fetch, port: config.port, hostname: config.hostname }, (info) => {
  console.log("assay api  ·  http://localhost:" + info.port + "  ·  contract " + CONTRACT_VERSION);
  console.log(
    "  source " +
      config.sourceLabel +
      " (" +
      config.source.kind +
      ")  ·  cors " +
      (config.allowedOrigins.length ? config.allowedOrigins.join(", ") : "(none allowed)"),
  );
  for (const path of servedPaths()) console.log("  " + path);
});

export { app };
