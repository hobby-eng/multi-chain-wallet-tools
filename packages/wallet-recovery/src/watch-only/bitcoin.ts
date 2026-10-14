import {
  bitcoinWatchModeLabel,
  parseBitcoinSlip132,
  parseBitcoinWatchDescriptor,
} from "./bitcoin-formats.js";
import {
  looksLikeExtendedPublicKey,
  WatchOnlyNotRecognizedError,
  chosenCoinPublicKey,
  prefixedValue,
  publicKeyMaterial,
  refuseOtherPrefix,
  watchOnlyDetector,
} from "../watch-only.js";
import { MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS } from "./multi-chain-profile.js";

export const detectBitcoinWatchOnly = watchOnlyDetector({
  prefixed(matched, trimmed, mode) {
    if (matched.prefix === "bitcoin-xpub") {
      const value = prefixedValue(matched);
      const slip132 = parseBitcoinSlip132(value);
      return {
        coinId: "bitcoin",
        kind: "bitcoin-xpub",
        value,
        ...(slip132 === null
          ? {}
          : { detectionLabel: slip132.label, bundleNetwork: slip132.network }),
      };
    }
    if (matched.prefix === "public-key")
      return publicKeyMaterial("bitcoin", prefixedValue(matched));
    refuseOtherPrefix(
      trimmed,
      matched,
      { id: "bitcoin", label: "Bitcoin" },
      mode,
      MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS,
    );
  },
  bare(trimmed, mode) {
    const descriptor = parseBitcoinWatchDescriptor(trimmed);
    if (descriptor !== null) {
      return {
        coinId: "bitcoin",
        kind: "bitcoin-descriptor",
        value: trimmed,
        detectionLabel: `Bitcoin ${bitcoinWatchModeLabel(descriptor.mode)} · exact descriptor`,
      };
    }
    const slip132 = parseBitcoinSlip132(trimmed);
    if (slip132 !== null)
      return {
        coinId: "bitcoin",
        kind: "bitcoin-xpub",
        value: trimmed,
        detectionLabel: slip132.label,
        bundleNetwork: slip132.network,
      };
    if (looksLikeExtendedPublicKey(trimmed)) {
      if (mode.auto) throw new WatchOnlyNotRecognizedError();
      return {
        coinId: "bitcoin",
        kind: "bitcoin-xpub",
        value: trimmed,
        detectionLabel: "Bitcoin · candidate account formats",
      };
    }
    const publicKey = chosenCoinPublicKey(trimmed, "bitcoin", mode);
    if (publicKey !== null) return publicKey;
    throw new WatchOnlyNotRecognizedError();
  },
});
