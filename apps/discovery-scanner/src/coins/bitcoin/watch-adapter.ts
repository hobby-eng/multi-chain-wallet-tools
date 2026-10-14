import { watchOnlyAdapter, type WatchOnlyScans } from "../registry.js";
import { BITCOIN_COIN } from "./coin.js";
import { scanBitcoinWatchOnly } from "./watch-only.js";
import { detectBitcoinWatchOnly } from "@ckd/recovery/watch-only/bitcoin.js";

export const BITCOIN_WATCH_ONLY: WatchOnlyScans = {
  detectWatchOnly: detectBitcoinWatchOnly,
  scanWatchOnly: scanBitcoinWatchOnly,
};

export const BITCOIN_WATCH_ONLY_RECOVERY_ADAPTER = watchOnlyAdapter(
  BITCOIN_COIN,
  BITCOIN_WATCH_ONLY,
);
