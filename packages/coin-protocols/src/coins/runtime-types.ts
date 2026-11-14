import type { DerivationResult } from "@ckd/core/types.js";
import type { CoinAdapter, CoinDerivationInput } from "./registry-base.js";

/** The row that an ownership test found: its index and its path. */
export interface OwnedAddressRow {
  readonly index: number;
  readonly path: string;
}

export interface RuntimeCoinAdapter extends CoinAdapter {
  derive(input: CoinDerivationInput): DerivationResult | Promise<DerivationResult>;
  /**
   * For each of `addresses`, the row of the input's account whose payment address it is, found by
   * the account's own keys instead of by deriving rows, so at any index a row can have; null where
   * the account's keys do not own it. The account's keys are derived once for all of them. Only a
   * variant whose keys can tell their own addresses offers it.
   */
  ownedAddresses?(
    input: Omit<CoinDerivationInput, "start" | "count">,
    addresses: readonly string[],
  ): readonly (OwnedAddressRow | null)[];
}
