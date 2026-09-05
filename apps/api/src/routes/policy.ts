import type { Hono } from "hono";
import type { Engine } from "../engine-computed.js";
import { reply, type Vars } from "../envelope.js";

/**
 * The rate card every rupee in every other response was computed from.
 *
 * This endpoint is what makes the rest of the API checkable. Each `PolicyLine`
 * carries the quote it was parsed from, the human who approved it and when —
 * so a merchant reading a fee line in the waterfall can follow its citation to
 * the rule here, and read the rule's own source. Without this route the
 * citations point at an id nobody outside the process can resolve.
 *
 * Served whole, unapproved lines included. An unapproved line is a fact about
 * the policy and hiding it would be the wrong kind of tidy; it is
 * `applyPolicy` that refuses to compute from one, and that refusal surfaces as
 * a 409 on the endpoints that do the computing.
 */
export function registerPolicyRoute(app: Hono<{ Variables: Vars }>, engine: Engine): void {
  app.get("/v1/policy", (c) => reply(c, engine.policy()));
}
