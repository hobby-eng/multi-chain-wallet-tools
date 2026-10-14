import type { RecoveryCoinAdapter } from "../../types.js";
import { DASH_SEED_RECOVERY_ADAPTER } from "./seed.js";
import { DASH_WATCH_ONLY } from "./watch-adapter.js";

export const DASH_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...DASH_SEED_RECOVERY_ADAPTER,
  ...DASH_WATCH_ONLY,
};

export type { RecoverySeedInput, RecoveryScanConfig } from "../../types.js";
