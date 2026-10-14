// Detection of Ethereum watch-only material: an extended public key or a single public key.
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

export const detectEthereumWatchOnly = watchOnlyDetector({
  prefixed(matched, trimmed, mode) {
    if (matched.prefix === "ethereum-xpub")
      return { coinId: "ethereum", kind: "ethereum-xpub", value: prefixedValue(matched) };
    if (matched.prefix === "public-key")
      return publicKeyMaterial("ethereum", prefixedValue(matched));
    refuseOtherPrefix(
      trimmed,
      matched,
      { id: "ethereum", label: "Ethereum" },
      mode,
      MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS,
    );
  },
  bare(trimmed, mode) {
    if (looksLikeExtendedPublicKey(trimmed)) {
      if (mode.auto) throw new WatchOnlyNotRecognizedError();
      return {
        coinId: "ethereum",
        kind: "ethereum-xpub",
        value: trimmed,
        detectionLabel: "Ethereum EOA · candidate BIP32 key",
      };
    }
    const publicKey = chosenCoinPublicKey(trimmed, "ethereum", mode);
    if (publicKey !== null) return publicKey;
    throw new WatchOnlyNotRecognizedError();
  },
});
