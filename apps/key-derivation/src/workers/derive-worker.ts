import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { runDerivationSelfTest } from "@ckd/derivation-self-test";
import { runLocalSearchSelfTest } from "@ckd/verification/local-search-self-test.js";
import { startDerivationWorker } from "./worker-runtime.js";
import { deriveSilentPayment } from "./silent-payment.js";
import { deriveBip85 } from "./bip85-deriver.js";
import { encryptDerivedP2pkhKey } from "./bip38-encrypter.js";
import { signDerivedMessage } from "./message-signer.js";
import { runBip85SelfTest } from "./bip85-self-test.js";
import { runBitcoinBip38FullSelfTest } from "./bip38-self-test-bitcoin.js";
import { runDashBip38FullSelfTest } from "./bip38-self-test-dash.js";
import {
  runBip322FullSelfTest,
  runBitcoinMessageSigningSelfTest,
} from "./message-signer-self-test-bitcoin.js";
import { runDashMessageSigningSelfTest } from "./message-signer-self-test-dash.js";
import { runSilentPaymentSelfTest } from "./silent-payment-self-test.js";

startDerivationWorker({
  getRuntimeCoinAdapter,
  runDerivationSelfTest,
  startupSelfTests: [
    runLocalSearchSelfTest,
    runSilentPaymentSelfTest,
    runBip85SelfTest,
    runBitcoinMessageSigningSelfTest,
    runDashMessageSigningSelfTest,
  ],
  fullSelfTests: [runBip322FullSelfTest, runBitcoinBip38FullSelfTest, runDashBip38FullSelfTest],
  signDerivedMessage,
  deriveSilentPayment,
  deriveBip85,
  encryptDerivedP2pkhKey,
});
