import { watchOnlyAdapter, type WatchOnlyScans } from "../registry.js";
import { DASH_COIN } from "./coin.js";
import { scanDashWatchOnly } from "./watch-only.js";
import { detectDashWatchOnly } from "@ckd/recovery/watch-only/dash.js";

export const DASH_WATCH_ONLY: WatchOnlyScans = {
  detectWatchOnly: detectDashWatchOnly,
  scanWatchOnly: scanDashWatchOnly,
};

export const DASH_WATCH_ONLY_RECOVERY_ADAPTER = watchOnlyAdapter(DASH_COIN, DASH_WATCH_ONLY);
