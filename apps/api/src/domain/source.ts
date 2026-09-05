/**
 * Path alias. The briefs say `domain/source.ts`; Batch 2 put the interface at
 * `sources/source.ts` and the repo wins. See docs/workstreams/PATHS.md.
 */
export type { SettlementSource } from "../sources/source.js";
export { SourceConfigError } from "../sources/source.js";
export type { CycleRef } from "./raw-cycle.js";

/** Which driver is in force. */
export type SourceName = "live" | "synthetic";
