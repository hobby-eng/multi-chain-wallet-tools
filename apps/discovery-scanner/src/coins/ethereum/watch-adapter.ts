import { watchOnlyAdapter, type WatchOnlyScans } from "../registry.js";
import { ETHEREUM_COIN } from "./coin.js";
import { detectEthereumWatchOnly } from "@ckd/recovery/watch-only/ethereum.js";
import { scanEthereumWatchOnly } from "./watch-only.js";

export const ETHEREUM_WATCH_ONLY: WatchOnlyScans = {
  detectWatchOnly: detectEthereumWatchOnly,
  scanWatchOnly: scanEthereumWatchOnly,
};

export const ETHEREUM_WATCH_ONLY_RECOVERY_ADAPTER = watchOnlyAdapter(
  ETHEREUM_COIN,
  ETHEREUM_WATCH_ONLY,
);
