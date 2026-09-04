import { randomUUID } from "node:crypto";
import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { CONTRACT_VERSION, type ApiError } from "@assay/contract";

/**
 * The single place an Assay response is shaped. Handlers never build an
 * envelope themselves: they put a payload or a problem on the context, and
 * this middleware turns either one into the contract shape.
 *
 *   success   { ok: true,  data, requestId }
 *   failure   { ok: false, error: { code, message, field }, requestId }
 *
 * Expected failures — a 404, a refused method — are data, not exceptions. They
 * travel as `problem` on the context so the normal middleware chain unwinds and
 * the CORS layer still decorates the response. `onError` below is the safety
 * net for a genuine bug, and it builds the same shape.
 */

export type Vars = {
  requestId: string;
  /** Set by a route handler. Serialised into the success envelope. */
  payload: unknown;
  /** Set instead of `payload` when the request cannot be answered. */
  problem: ApiProblem;
};

export type AppContext = Context<{ Variables: Vars }>;

export class ApiProblem {
  constructor(
    readonly status: 400 | 401 | 404 | 405 | 409 | 500,
    readonly code: ApiError["code"],
    readonly message: string,
    readonly field: string | null = null,
  ) {}
}

/** `source` is "live" only when we are reading a real rail. Anything else is mock. */
export const SOURCE: "mock" | "live" = process.env.ASSAY_SOURCE === "live" ? "live" : "mock";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-assay-source": SOURCE,
  "x-assay-contract": CONTRACT_VERSION,
};

function body(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), { status, headers: JSON_HEADERS });
}

function failure(p: ApiProblem, requestId: string): Response {
  return body(
    { ok: false, error: { code: p.code, message: p.message, field: p.field }, requestId },
    p.status,
  );
}

/**
 * What a handler returns. The body is a placeholder: the middleware below
 * replaces it with the real envelope on the way out. Handlers therefore state
 * *what* they answer with, never how it is wrapped.
 */
export function reply(c: AppContext, payload: unknown): Response {
  c.set("payload", payload);
  return c.body(null, 200);
}

export function refuse(c: AppContext, problem: ApiProblem): Response {
  c.set("problem", problem);
  return c.body(null, problem.status);
}

export const envelope: MiddlewareHandler<{ Variables: Vars }> = async (c, next) => {
  const requestId = "req_" + randomUUID().slice(0, 12);
  c.set("requestId", requestId);

  await next();

  const problem = c.get("problem");
  if (problem) {
    c.res = failure(problem, requestId);
    return;
  }

  const payload = c.get("payload");
  // A framework-produced response (a CORS preflight) carries neither. Leave it.
  if (payload === undefined) return;
  c.res = body({ ok: true, data: payload, requestId }, 200);
};

/** Last resort. A throw that reaches here is our bug, and the caller sees none of it. */
export const onError: ErrorHandler<{ Variables: Vars }> = (err, c) => {
  const requestId = c.get("requestId") ?? "req_unassigned";
  console.error("[assay:api]", requestId, err);
  return failure(new ApiProblem(500, "internal", "Assay could not complete this request."), requestId);
};
