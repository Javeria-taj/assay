import { z } from "zod";
import { buildPath, endpoints, ErrorResponse, type ApiError, type EndpointName } from "./contract.js";

/**
 * Typed client. Every response is parsed through the contract before it reaches
 * a component, so a drifting API fails loudly at the boundary instead of
 * rendering wrong money.
 *
 *   const api = createClient({ baseUrl: process.env.NEXT_PUBLIC_ASSAY_API! });
 *   const explanation = await api.getExplanation({ settlementId });
 */

export class AssayApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
    readonly requestId: string | null,
  ) {
    super(error.message);
    this.name = "AssayApiError";
  }
}

export class AssayContractError extends Error {
  constructor(
    readonly endpoint: EndpointName,
    readonly issues: z.ZodIssue[],
  ) {
    super(
      "Response from " +
        endpoint +
        " does not match contract: " +
        issues.map((i) => i.path.join(".") + " " + i.message).join("; "),
    );
    this.name = "AssayContractError";
  }
}

export type ClientOptions = {
  baseUrl: string;
  token?: string;
  fetch?: typeof fetch;
  /** Passed through to fetch; Next.js uses this for revalidation. */
  init?: RequestInit;
};

type DataOf<N extends EndpointName> = z.infer<(typeof endpoints)[N]["response"]> extends {
  data: infer D;
}
  ? D
  : never;

export function createClient(opts: ClientOptions) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch;

  async function call<N extends EndpointName>(
    name: N,
    params: Record<string, string> = {},
    init: RequestInit = {},
  ): Promise<DataOf<N>> {
    const res = await doFetch(base + buildPath(name, params), {
      ...opts.init,
      ...init,
      headers: {
        accept: "application/json",
        ...(opts.token ? { authorization: "Bearer " + opts.token } : {}),
        ...(opts.init?.headers ?? {}),
        ...(init.headers ?? {}),
      },
    });

    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const err = ErrorResponse.safeParse(json);
      throw new AssayApiError(
        res.status,
        err.success
          ? err.data.error
          : { code: "internal", message: "HTTP " + res.status, field: null },
        err.success ? err.data.requestId : null,
      );
    }

    const parsed = endpoints[name].response.safeParse(json);
    if (!parsed.success) throw new AssayContractError(name, parsed.error.issues);
    return (parsed.data as { data: DataOf<N> }).data;
  }

  return {
    health: (init?: RequestInit) => call("health", {}, init),
    listSettlements: (init?: RequestInit) => call("listSettlements", {}, init),
    getSettlement: (p: { settlementId: string }, init?: RequestInit) => call("getSettlement", p, init),
    getExplanation: (p: { settlementId: string }, init?: RequestInit) => call("getExplanation", p, init),
    getCeiling: (p: { settlementId: string }, init?: RequestInit) => call("getCeiling", p, init),
    getWindow: (p: { settlementId: string }, init?: RequestInit) => call("getWindow", p, init),
    getReport: (p: { settlementId: string }, init?: RequestInit) => call("getReport", p, init),
    getForecast: (init?: RequestInit) => call("getForecast", {}, init),
    getPolicy: (init?: RequestInit) => call("getPolicy", {}, init),
  };
}

export type AssayClient = ReturnType<typeof createClient>;
