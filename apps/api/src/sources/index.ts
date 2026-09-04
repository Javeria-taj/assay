import { LiveSettlementSource } from "./live.js";
import { SyntheticSettlementSource } from "./synthetic.js";
import { SourceConfigError, type SettlementSource } from "./source.js";

export * from "./source.js";
export { LiveSettlementSource } from "./live.js";
export { SyntheticSettlementSource } from "./synthetic.js";

/**
 * Chooses the source from ASSAY_SOURCE. Anything other than "live" is
 * synthetic, which is the safe default: Assay would rather show constructed
 * data it can explain than real data it cannot reach.
 *
 * Asking for `live` without keys is a startup failure, never a silent
 * fallback. A demo that quietly serves synthetic data while claiming to be
 * live is the one failure this project cannot afford.
 */
export function createSource(env: NodeJS.ProcessEnv = process.env): SettlementSource {
  if (env.ASSAY_SOURCE !== "live") return new SyntheticSettlementSource();

  const keyId = env.RAZORPAY_KEY_ID ?? "";
  const keySecret = env.RAZORPAY_KEY_SECRET ?? "";
  if (!keyId || !keySecret) {
    throw new SourceConfigError(
      "ASSAY_SOURCE=live but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. " +
        "Set both, or unset ASSAY_SOURCE to use the synthetic source. Assay will not fall back silently.",
    );
  }
  return new LiveSettlementSource(keyId, keySecret);
}
