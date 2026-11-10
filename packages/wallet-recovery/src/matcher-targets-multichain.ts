import { BITCOIN_MATCHER } from "./address-targets.js";
import { DASH_MATCHER } from "./matcher-targets-dash.js";
import { BITCOIN_CASH_MATCHER } from "./matcher-targets-bitcoin-cash.js";
import { COSMOS_MATCHER } from "./matcher-targets-cosmos.js";
import { DOGECOIN_MATCHER } from "./matcher-targets-dogecoin.js";
import { ETHEREUM_CLASSIC_MATCHER } from "./matcher-targets-ethereum-classic.js";
import { ETHEREUM_MATCHER } from "./matcher-targets-ethereum.js";
import { HEDERA_MATCHER } from "./matcher-targets-hedera.js";
import { INJECTIVE_MATCHER } from "./matcher-targets-injective.js";
import { LITECOIN_MATCHER } from "./matcher-targets-litecoin.js";
import { NEAR_MATCHER } from "./matcher-targets-near.js";
import { SOLANA_MATCHER } from "./matcher-targets-solana.js";
import { STELLAR_MATCHER } from "./matcher-targets-stellar.js";
import { TRON_MATCHER } from "./matcher-targets-tron.js";
import { XRP_MATCHER } from "./matcher-targets-xrp.js";
import { ZCASH_MATCHER } from "./matcher-targets-zcash.js";
import { detectMatcherTargets, type MatcherCoin } from "./matcher-targets.js";
import type { WalletMatcherTargetDetector } from "./matcher-types.js";

/** The coins of the Multi-Chain Edition, in the order their recognizers are asked. */
export const MULTI_CHAIN_MATCHER_COINS: readonly MatcherCoin[] = [
  ETHEREUM_MATCHER,
  BITCOIN_MATCHER,
  DASH_MATCHER,
  LITECOIN_MATCHER,
  DOGECOIN_MATCHER,
  BITCOIN_CASH_MATCHER,
  ZCASH_MATCHER,
  XRP_MATCHER,
  TRON_MATCHER,
  ETHEREUM_CLASSIC_MATCHER,
  COSMOS_MATCHER,
  INJECTIVE_MATCHER,
  SOLANA_MATCHER,
  STELLAR_MATCHER,
  NEAR_MATCHER,
  HEDERA_MATCHER,
];

/** The matcher targets of the Multi-Chain Edition. */
export const detectMultiChainMatcherTargets: WalletMatcherTargetDetector = (
  input,
  network,
  forceAllProfiles,
) => detectMatcherTargets(input, network, forceAllProfiles, MULTI_CHAIN_MATCHER_COINS);
