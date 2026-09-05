import { createClient } from "@assay/contract";
import type {
  Ceiling,
  DiscrepancyReport,
  DisputeWindow,
  Explanation,
  Forecast,
  Policy,
} from "@assay/contract";

/**
 * The one place the web app talks to the API.
 *
 * Every response is parsed through the shared contract before a component sees
 * it, so a drifting API throws `AssayContractError` at this boundary instead of
 * rendering a wrong number as if it were right. That is deliberate: do not
 * catch and swallow it.
 *
 * Switching to a different API is one env var and no code change.
 */

/**
 * Render's `fromService` supplies a bare host — `assay-api.onrender.com` — so
 * the scheme is added here rather than typed into a dashboard field somebody
 * has to remember. A value that already carries a scheme is left alone, which
 * keeps `http://localhost:4317` working in development.
 */
function normaliseBase(raw: string | undefined): string {
  const v = (raw ?? "").trim().replace(/\/+$/, "");
  if (!v) return "http://localhost:4317";
  return /^https?:\/\//.test(v) ? v : "https://" + v;
}

export const BASE_URL = normaliseBase(process.env.NEXT_PUBLIC_ASSAY_API);

export const api = createClient({
  baseUrl: BASE_URL,
  /* The countdown must be true when the page is read, not when it was built. */
  init: { cache: "no-store" },
});

/** Everything one settlement screen needs, in one round of requests. */
export type ConsoleData = {
  explanation: Explanation;
  ceiling: Ceiling;
  window: DisputeWindow;
  report: DiscrepancyReport;
  forecast: Forecast;
  policy: Policy;
};

/**
 * Fetched together because the screen is a single view of a single settlement:
 * a waterfall that arrived without its ceiling would render the finding as half
 * a sentence.
 */
export async function loadConsole(settlementId: string): Promise<ConsoleData> {
  const [explanation, ceiling, window, report, forecast, policy] = await Promise.all([
    api.getExplanation({ settlementId }),
    api.getCeiling({ settlementId }),
    api.getWindow({ settlementId }),
    api.getReport({ settlementId }),
    api.getForecast(),
    api.getPolicy(),
  ]);
  return { explanation, ceiling, window, report, forecast, policy };
}
