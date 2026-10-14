import { runBitcoinDerivationSelfTest } from "./derivation-self-test-bitcoin.js";
import { runDashDerivationSelfTest } from "./derivation-self-test-dash.js";
import { runEthereumDerivationSelfTest } from "./derivation-self-test-ethereum.js";
import { combinedSelfTest } from "./helpers.js";
import type { CryptoSelfTestReport } from "./types.js";

/**
 * Runs only inside the worker. It does not import BIP39 or user input. The Multi-Chain Edition runs
 * each coin's own vectors, the same ones an edition with fewer coins runs.
 */
export function runDerivationSelfTest(): Promise<CryptoSelfTestReport> {
  return combinedSelfTest([
    runBitcoinDerivationSelfTest,
    runDashDerivationSelfTest,
    runEthereumDerivationSelfTest,
  ]);
}
