/**
 * Money in Assay is ALWAYS an integer number of paise. Never a float, never rupees.
 * ₹12,00,000.00 is 120_000_000. There is no currency field: this API is INR-only.
 *
 * Deductions are negative. A waterfall reconciles when the signed lines sum to net.
 */
export type Paise = number;

export const RUPEE = 100;

/** ₹ amount (may have paise) -> integer paise. Rounds half away from zero. */
export function rupees(amount: number): Paise {
  const scaled = amount * RUPEE;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Basis points of a base amount, rounded half away from zero. 200 bps = 2%. */
export function bps(base: Paise, basisPoints: number): Paise {
  const scaled = (base * basisPoints) / 10_000;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Indian-format display. 112_891_800 -> "₹11,28,918.00" */
export function formatPaise(p: Paise, opts: { paise?: boolean } = {}): string {
  const showPaise = opts.paise ?? true;
  const neg = p < 0;
  const abs = Math.abs(p);
  const whole = Math.trunc(abs / RUPEE);
  const frac = abs % RUPEE;
  const s = String(whole);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  const tail = showPaise ? "." + String(frac).padStart(2, "0") : "";
  return (neg ? "-₹" : "₹") + grouped + tail;
}

/** Share of a total, as a fraction rounded to 4dp. Guards divide-by-zero. */
export function share(part: Paise, total: Paise): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 10_000) / 10_000;
}
