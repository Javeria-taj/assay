import type { Citation } from "./computed.js";

/**
 * The three-day clause, as a value.
 *
 * Every field is server-computed. The client never guesses the clock, because
 * a countdown that disagrees with the server is worse than no countdown: this
 * one is telling her whether a contractual right is still hers.
 */
export type WindowStatus = "open" | "closing" | "expired";

export type DisputeWindowData = {
  settlementId: string;
  settledAt: number;
  /** settledAt + 3 days, per the clause carried in `clause`. */
  deadlineAt: number;
  /** The server's clock at the moment of the request. */
  serverNow: number;
  msRemaining: number;
  status: WindowStatus;
  /** "closing" once under this many ms remain. */
  closingThresholdMs: number;
  clause: Citation;
};
