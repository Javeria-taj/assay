import { formatPaise } from "@assay/contract";

/**
 * Display formatting. Every rupee on screen goes through here.
 *
 * Money arrives as integer paise and is rendered by `formatPaise` from the
 * contract — never divided by 100 here, never anywhere else. If a component
 * finds itself doing arithmetic on money, that is the bug.
 */

/** U+2212, the real minus sign. Not a hyphen. */
export const MINUS = "−";

/**
 * A deduction, as the screen shows it: `− ₹24,000.00`.
 *
 * `formatPaise` returns a hyphen form for negatives, which is the wrong glyph
 * in a column of figures — a hyphen is a word-joiner and reads narrow and low
 * against lining numerals. The sign is rebuilt here rather than patched into
 * the frozen contract.
 */
export function deduction(paise: number, opts: { paise?: boolean } = {}): string {
  return MINUS + " " + formatPaise(Math.abs(paise), opts);
}

/**
 * A signed amount for the ledger: deductions carry the minus, credits do not.
 * `gross_captured` is a credit and `net_credited` is a marker, so neither gets
 * a sign.
 */
export function signed(paise: number, opts: { paise?: boolean } = {}): string {
  return paise < 0 ? deduction(paise, opts) : formatPaise(paise, opts);
}

/** Plain money, no sign logic. */
export const money = (paise: number, opts: { paise?: boolean } = {}): string =>
  formatPaise(paise, opts);

/** Indian digit grouping for counts: 1100 -> "1,100". */
export const count = (n: number): string => new Intl.NumberFormat("en-IN").format(n);

/** A share as the panel writes it: 0.3376 -> "33.8%". */
export const percent = (share: number, dp = 1): string => (share * 100).toFixed(dp) + "%";

/* --------------------------------------------------------------- the clock */

/**
 * The countdown, in the two shapes the copy deck pins: `2d 18h` while there is
 * more than a day, `17h 42m` inside the last day.
 *
 * Never called with the browser's own clock — see `useServerClock`.
 */
export function remaining(ms: number): string {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  return days > 0 ? days + "d " + hours + "h" : hours + "h " + minutes + "m";
}

/** How long ago the window closed: "2 days ago". */
export function elapsed(ms: number): string {
  const days = Math.floor(Math.abs(ms) / 86_400_000);
  if (days >= 1) return days === 1 ? "1 day ago" : days + " days ago";
  const hours = Math.floor(Math.abs(ms) / 3_600_000);
  return hours <= 1 ? "an hour ago" : hours + " hours ago";
}

/**
 * The deadline as the strip states it: `6 Sep 2026, 11:00 IST`.
 *
 * Always Asia/Kolkata. The merchant's window closes on India's clock wherever
 * the browser happens to be, and a window that appears to close at a different
 * hour in a different timezone would be worse than showing none.
 */
export function istTimestamp(epochMs: number): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(epochMs);
  const at = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return at("day") + " " + at("month") + " " + at("year") + ", " + at("hour") + ":" + at("minute") + " IST";
}
