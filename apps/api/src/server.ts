import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { CONTRACT_VERSION, Health } from "@assay/contract";
import { ApiProblem, SOURCE, envelope, onError, refuse, reply, type Vars } from "./envelope.js";

/**
 * The Assay API.
 *
 * Read-only by construction: every endpoint is a GET, and anything else is
 * refused before it reaches a route. This batch serves /v1/health only; the
 * rest of the contract lands in later batches.
 */

const app = new Hono<{ Variables: Vars }>();
app.onError(onError);

/* One origin in production. Localhost is added only outside it, so a deployed
 * API never answers a laptop. */
const origins = [...new Set(
  [process.env.ALLOWED_ORIGIN, process.env.NODE_ENV !== "production" ? "http://localhost:3000" : null]
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim().replace(/\/+$/, "")),
)];

/* CORS sits outside the envelope so that it decorates the finished response,
 * refusals included. */
app.use(
  "*",
  cors({
    origin: (origin) => (origins.includes(origin.replace(/\/+$/, "")) ? origin : null),
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

app.get("/v1/health", (c) => {
  /* Validated against the contract before it is sent: the API holds itself to
   * the same schema the web app parses with. */
  const health = Health.parse({
    status: "ok",
    contractVersion: CONTRACT_VERSION,
    source: SOURCE,
    serverNow: Date.now(),
  });
  return reply(c, health);
});

/* Last route: matches only what nothing above matched. */
app.all("*", (c) => {
  const path = new URL(c.req.url).pathname;
  return refuse(c, new ApiProblem(404, "not_found", "No route for " + path + "."));
});

/* ----------------------------------------------------------------- listen */

const port = Number(process.env.PORT ?? 4318);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log("assay api  ·  http://localhost:" + info.port + "  ·  contract " + CONTRACT_VERSION);
  console.log("  source " + SOURCE + "  ·  cors " + (origins.length ? origins.join(", ") : "(none allowed)"));
  console.log("  GET /v1/health");
});

export { app };
