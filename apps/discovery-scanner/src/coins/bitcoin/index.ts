import type { RecoveryCoinAdapter } from "../../types.js";
import { BITCOIN_SEED_RECOVERY_ADAPTER } from "./seed.js";
import { BITCOIN_WATCH_ONLY } from "./watch-adapter.js";

export const BITCOIN_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...BITCOIN_SEED_RECOVERY_ADAPTER,
  ...BITCOIN_WATCH_ONLY,
};
