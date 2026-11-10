// Detection of an EVM network's watch-only material: an extended public key or a single public key.
// The same 0x accounts belong to every EVM network; only Ethereum owns the explicit
// "ethereum-xpub:" prefix (prefix-coins.json), which every other network refuses as Ethereum's.
import {
  chosenCoinPublicKey,
  looksLikeExtendedPublicKey,
  prefixedValue,
  publicKeyMaterial,
  refuseOtherPrefix,
  WatchOnlyNotRecognizedError,
  watchOnlyDetector,
} from "../watch-only.js";
import { MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS } from "./multi-chain-profile.js";
import type { DetectedWatchOnlyMaterial } from "./types.js";

/** The explicit prefix of an Ethereum extended public key. */
const ETHEREUM_XPUB_PREFIX = "ethereum-xpub";

/** The watch-only detector of the EVM network `coin` (its EVM network table id and label). */
export function evmWatchOnlyDetector(coin: {
  readonly id: string;
  readonly label: string;
}): (raw: string, mode: { auto: boolean }) => DetectedWatchOnlyMaterial {
  const ownsPrefix = MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS[ETHEREUM_XPUB_PREFIX] === coin.id;
  return watchOnlyDetector({
    prefixed(matched, trimmed, mode) {
      if (matched.prefix === ETHEREUM_XPUB_PREFIX && ownsPrefix)
        return { coinId: coin.id, kind: "ethereum-xpub", value: prefixedValue(matched) };
      if (matched.prefix === "public-key")
        return publicKeyMaterial(coin.id, prefixedValue(matched));
      refuseOtherPrefix(trimmed, matched, coin, mode, MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS);
    },
    bare(trimmed, mode) {
      if (looksLikeExtendedPublicKey(trimmed)) {
        if (mode.auto) throw new WatchOnlyNotRecognizedError();
        return {
          coinId: coin.id,
          kind: "ethereum-xpub",
          value: trimmed,
          detectionLabel: `${coin.label} EOA · candidate BIP32 key`,
        };
      }
      const publicKey = chosenCoinPublicKey(trimmed, coin.id, mode);
      if (publicKey !== null) return publicKey;
      throw new WatchOnlyNotRecognizedError();
    },
  });
}
