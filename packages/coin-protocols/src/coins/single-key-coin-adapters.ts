// Every single-key coin's adapters, for the full Multi-Chain registry; a selective build composes
// its own coins instead (tooling/key-derivation-composition.mjs).
import { BITCOIN_CASH_COIN_ADAPTERS } from "./adapters/bitcoin-cash.js";
import { COSMOS_COIN_ADAPTERS } from "./adapters/cosmos.js";
import { DOGECOIN_COIN_ADAPTERS } from "./adapters/dogecoin.js";
import { ETHEREUM_CLASSIC_COIN_ADAPTERS } from "./adapters/ethereum-classic.js";
import { HEDERA_COIN_ADAPTERS } from "./adapters/hedera.js";
import { INJECTIVE_COIN_ADAPTERS } from "./adapters/injective.js";
import { LITECOIN_COIN_ADAPTERS } from "./adapters/litecoin.js";
import { NEAR_COIN_ADAPTERS } from "./adapters/near.js";
import { SOLANA_COIN_ADAPTERS } from "./adapters/solana.js";
import { STELLAR_COIN_ADAPTERS } from "./adapters/stellar.js";
import { TON_COIN_ADAPTERS } from "./adapters/ton.js";
import { TRON_COIN_ADAPTERS } from "./adapters/tron.js";
import { XRP_COIN_ADAPTERS } from "./adapters/xrp.js";
import { ZCASH_COIN_ADAPTERS } from "./adapters/zcash.js";
import type { CoinAdapter } from "./registry-base.js";

/**
 * The single-key coins, registered after Bitcoin, Ethereum and Dash; the Coin menu orders every coin
 * by its name instead (coin-order.ts).
 */
export const SINGLE_KEY_COIN_ADAPTERS: readonly CoinAdapter[] = [
  ...LITECOIN_COIN_ADAPTERS,
  ...DOGECOIN_COIN_ADAPTERS,
  ...BITCOIN_CASH_COIN_ADAPTERS,
  ...ZCASH_COIN_ADAPTERS,
  ...XRP_COIN_ADAPTERS,
  ...TRON_COIN_ADAPTERS,
  ...ETHEREUM_CLASSIC_COIN_ADAPTERS,
  ...COSMOS_COIN_ADAPTERS,
  ...INJECTIVE_COIN_ADAPTERS,
  ...SOLANA_COIN_ADAPTERS,
  ...STELLAR_COIN_ADAPTERS,
  ...NEAR_COIN_ADAPTERS,
  ...HEDERA_COIN_ADAPTERS,
  ...TON_COIN_ADAPTERS,
];
