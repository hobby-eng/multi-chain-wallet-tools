import { runBitcoinDerivationSelfTest } from "./derivation-self-test-bitcoin.js";
import { runDashDerivationSelfTest } from "./derivation-self-test-dash.js";
import { runEthereumDerivationSelfTest } from "./derivation-self-test-ethereum.js";
import { runBitcoinCashDerivationSelfTest } from "./derivation-self-test-bitcoin-cash.js";
import { runCosmosDerivationSelfTest } from "./derivation-self-test-cosmos.js";
import { runDogecoinDerivationSelfTest } from "./derivation-self-test-dogecoin.js";
import { runEthereumClassicDerivationSelfTest } from "./derivation-self-test-ethereum-classic.js";
import { runInjectiveDerivationSelfTest } from "./derivation-self-test-injective.js";
import { runHederaDerivationSelfTest } from "./derivation-self-test-hedera.js";
import { runLitecoinDerivationSelfTest } from "./derivation-self-test-litecoin.js";
import { runNearDerivationSelfTest } from "./derivation-self-test-near.js";
import { runSolanaDerivationSelfTest } from "./derivation-self-test-solana.js";
import { runStellarDerivationSelfTest } from "./derivation-self-test-stellar.js";
import { runTonDerivationSelfTest } from "./derivation-self-test-ton.js";
import { runTronDerivationSelfTest } from "./derivation-self-test-tron.js";
import { runXrpDerivationSelfTest } from "./derivation-self-test-xrp.js";
import { runZcashDerivationSelfTest } from "./derivation-self-test-zcash.js";
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
    runLitecoinDerivationSelfTest,
    runDogecoinDerivationSelfTest,
    runBitcoinCashDerivationSelfTest,
    runZcashDerivationSelfTest,
    runXrpDerivationSelfTest,
    runTronDerivationSelfTest,
    runEthereumClassicDerivationSelfTest,
    runCosmosDerivationSelfTest,
    runInjectiveDerivationSelfTest,
    runSolanaDerivationSelfTest,
    runStellarDerivationSelfTest,
    runNearDerivationSelfTest,
    runHederaDerivationSelfTest,
    runTonDerivationSelfTest,
  ]);
}
