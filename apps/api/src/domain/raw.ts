/**
 * Path alias. The wave-1 briefs were written against `domain/raw.ts`; the repo
 * has `domain/raw-cycle.ts` from Batch 2 and the repo wins. This re-export
 * exists so a brief's import path resolves without three agents each renaming
 * a file. See docs/workstreams/PATHS.md.
 */
export type * from "./raw-cycle.js";
