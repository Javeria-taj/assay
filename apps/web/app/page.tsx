import { Console } from "@/components/console";
import { loadConsole } from "@/lib/api";

/**
 * The console. One route, one settlement.
 *
 * Data is fetched on the server so the screen arrives whole. The spec is
 * explicit that there are no spinners here, and a waterfall that pops in a row
 * at a time undercuts the one thing it is claiming — that the figures add up.
 * Only the countdown is a client concern, because only it changes.
 *
 * Nothing is cached: `no-store` means every load recomputes from the engine, so
 * the countdown and the window status are true at the moment they are read
 * rather than true when the page was built.
 */

export const dynamic = "force-dynamic";

const SETTLEMENT_ID = "stl_2608mera01";

export default async function ConsolePage() {
  const data = await loadConsole(SETTLEMENT_ID);
  return <Console data={data} />;
}
