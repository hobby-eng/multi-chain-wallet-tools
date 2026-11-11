// The account coins, built from the account coin table and each coin's own derivation for the
// development build; a composed build inlines the rows of its selected coins and imports only
// their derivations instead (tooling/discovery-composition.mjs).
import type { CoinAddressScheme } from "@ckd/coins/address-scheme.js";
import { COSMOS_ADDRESSES } from "@ckd/coins/cosmos/index.js";
import { HEDERA_ADDRESSES } from "@ckd/coins/hedera/index.js";
import { INJECTIVE_ADDRESSES } from "@ckd/coins/injective/index.js";
import { NEAR_ADDRESSES } from "@ckd/coins/near/index.js";
import { SOLANA_ADDRESSES } from "@ckd/coins/solana/index.js";
import { STELLAR_ADDRESSES } from "@ckd/coins/stellar/index.js";
import { TON_ADDRESSES } from "@ckd/coins/ton/index.js";
import { TRON_ADDRESSES } from "@ckd/coins/tron/index.js";
import { XRP_ADDRESSES } from "@ckd/coins/xrp/index.js";
import { ACCOUNT_COINS } from "@ckd/public-data-providers/account-coins.js";
import type { RecoveryCoinAdapter } from "../types.js";
import { createAccountSeedRecoveryAdapter } from "./account/seed.js";

/** Each account coin's addresses, by its id: the Deriver's coin modules. */
const ADDRESSES: Readonly<Record<string, CoinAddressScheme>> = {
  solana: SOLANA_ADDRESSES,
  xrp: XRP_ADDRESSES,
  stellar: STELLAR_ADDRESSES,
  near: NEAR_ADDRESSES,
  tron: TRON_ADDRESSES,
  cosmos: COSMOS_ADDRESSES,
  injective: INJECTIVE_ADDRESSES,
  hedera: HEDERA_ADDRESSES,
  ton: TON_ADDRESSES,
};

/** Every account coin of the account coin table, in the table's order. */
export const ACCOUNT_COIN_RECOVERY_ADAPTERS: readonly RecoveryCoinAdapter[] = ACCOUNT_COINS.map(
  (facts) => {
    const addresses = ADDRESSES[facts.id];
    if (addresses === undefined) throw new Error(`No derivation of account coin ${facts.id}.`);
    return createAccountSeedRecoveryAdapter(facts, addresses);
  },
);
