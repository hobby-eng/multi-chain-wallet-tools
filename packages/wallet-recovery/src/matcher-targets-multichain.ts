import { BITCOIN_MATCHER } from "./address-targets.js";
import { DASH_MATCHER } from "./matcher-targets-dash.js";
import { ETHEREUM_MATCHER } from "./matcher-targets-ethereum.js";
import { detectMatcherTargets, type MatcherCoin } from "./matcher-targets.js";
import type { WalletMatcherTargetDetector } from "./matcher-types.js";

/** The coins of the Multi-Chain Edition, in the order their recognizers are asked. */
export const MULTI_CHAIN_MATCHER_COINS: readonly MatcherCoin[] = [
  ETHEREUM_MATCHER,
  BITCOIN_MATCHER,
  DASH_MATCHER,
];

/** The matcher targets of the Multi-Chain Edition. */
export const detectMultiChainMatcherTargets: WalletMatcherTargetDetector = (
  input,
  network,
  forceAllProfiles,
) => detectMatcherTargets(input, network, forceAllProfiles, MULTI_CHAIN_MATCHER_COINS);
