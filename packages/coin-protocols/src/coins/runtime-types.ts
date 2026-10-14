import type { DerivationResult } from "@ckd/core/types.js";
import type { CoinAdapter, CoinDerivationInput } from "./registry-base.js";

export interface RuntimeCoinAdapter extends CoinAdapter {
  derive(input: CoinDerivationInput): DerivationResult | Promise<DerivationResult>;
}
