import { Console } from "@/components/console";
import { Unreachable } from "@/components/unreachable";
import { loadConsole } from "@/lib/api";

/**
 * The console. One route, one settlement.
 *
 * Data is fetched on the server so the screen arrives whole. The spec is
 * explicit that there are no spinners here, and a waterfall that pops in a row
 * at a time undercuts the one thing it is claiming — that the figures add up.
 * Only the countdown is a client concern, because only it changes.
 *
 * Nothing is cached: every load recomputes from the engine, so the countdown
 * and the window status are true at the moment they are read rather than true
 * when the page was built.
 *
 * The fetch is guarded rather than left to throw. Two reasons, and the second
 * is the one that bit us: a failure here should render the refusal, not a stack
 * trace; and this route is the service's health check, so a page that throws
 * when the API is briefly unreachable fails the deploy and takes the site down
 * over a dependency that was only slow to start.
 */

export const dynamic = "force-dynamic";

const SETTLEMENT_ID = "stl_2608mera01";

export default async function ConsolePage() {
  try {
    const data = await loadConsole(SETTLEMENT_ID);
    return <Console data={data} />;
  } catch (error) {
    return <Unreachable error={error} />;
  }
}
