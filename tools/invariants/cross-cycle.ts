import type { InvariantCheck, InvariantContext } from "./index.js";
import { buildPath, paged, SettlementSummary } from "../../packages/contract/src/contract.js";
import { checkOneSettlement, fetchParsed, sourceOf, type Fetched } from "./ceiling.js";

/**
 * The same ceiling identities over EVERY settlement in the list, not just
 * `ctx.settlementId`.
 *
 * One settlement passing proves the fixture is served correctly. It does not
 * prove the engine computes — a hardcoded response passes it too. Paging the
 * list and running the identities over everything in it is what makes the
 * difference visible over the wire.
 *
 * `run` returns `[]` for pass, or human-readable problem strings naming the
 * settlement id. It never throws, never exits, and never prints.
 */

/** Enough to prove the engine runs; few enough that `pnpm verify` stays quick. */
const MAX_SETTLEMENTS = 10;

const describe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const Page = paged(SettlementSummary);
type SettlementPage = { items: SettlementSummary[]; nextCursor: string | null };

async function listSettlementIds(ctx: InvariantContext): Promise<{ ids: string[] } | { problem: string }> {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const path: string =
      buildPath("listSettlements") + (cursor === null ? "" : "?cursor=" + encodeURIComponent(cursor));
    const page: Fetched<SettlementPage> = await fetchParsed(ctx, path, Page, "settlements list");
    if ("problem" in page) return { problem: page.problem };

    for (const item of page.value.items) {
      if (ids.length < MAX_SETTLEMENTS) ids.push(item.id);
    }
    cursor = page.value.nextCursor;
    pages += 1;

    /* A server that returns the same cursor forever would page until the heat
     * death of the run. Stop at the cap either way. */
    if (ids.length >= MAX_SETTLEMENTS || pages > MAX_SETTLEMENTS) break;
  } while (cursor !== null);

  return { ids };
}

export const crossCycleCheck: InvariantCheck = {
  name: "cross-cycle",
  async run(ctx) {
    try {
      const listed = await listSettlementIds(ctx);
      if ("problem" in listed) return [listed.problem];

      const { ids } = listed;
      if (ids.length === 0) {
        return ["cross-cycle: /v1/settlements listed nothing, so no ceiling was cross-checked"];
      }

      const problems: string[] = [];
      const unique = new Set(ids);
      if (unique.size !== ids.length) {
        problems.push("cross-cycle: the settlements list repeats an id, so the page cursor is wrong");
      }

      for (const id of ids) {
        problems.push(...(await checkOneSettlement(ctx, id)));
      }

      /* A harness that quietly tested nothing is worse than one that fails. A
       * single-settlement list is only NOT a finding on the fixture mock, which
       * ships exactly one settlement by design and says so on /v1/health. On
       * anything else — a live deploy, a generator-backed API — a list of one
       * means this check covered nothing the `ceiling` check did not, and it
       * says so instead of passing silently. */
      if (ids.length === 1 && (await sourceOf(ctx)) !== "mock") {
        problems.push(
          "cross-cycle: /v1/settlements returned a single settlement (" +
            ids[0] +
            "), so this check covered nothing the ceiling check did not",
        );
      }

      return problems;
    } catch (e) {
      return ["cross-cycle: the check itself failed — " + describe(e)];
    }
  },
};
