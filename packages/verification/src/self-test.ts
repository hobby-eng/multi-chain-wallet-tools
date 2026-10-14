import { runBip39SelfTest } from "./bip39-self-test.js";
import { runDerivationSelfTest } from "./derivation-self-test.js";
import { combinedSelfTest } from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

export type { CryptoSelfTestReport } from "./types.js";

/** Complete report used by non-size-constrained tools and release verification. */
export function runCryptoSelfTest(): Promise<CryptoSelfTestReport> {
  return combinedSelfTest([runBip39SelfTest, runDerivationSelfTest]);
}
