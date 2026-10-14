import { getRuntimeCoinAdapter } from "@ckd/coins/dash-runtime-registry.js";
import { runDashDerivationSelfTest } from "@ckd/dash-derivation-self-test";
import { runLocalSearchSelfTest } from "@ckd/verification/local-search-self-test.js";
import { startDerivationWorker } from "./worker-runtime.js";
import { encryptDerivedP2pkhKey } from "./bip38-encrypter-dash.js";
import { signDerivedMessage } from "./message-signer-dash.js";
import { runDashBip38FullSelfTest } from "./bip38-self-test-dash.js";
import { runDashMessageSigningSelfTest } from "./message-signer-self-test-dash.js";

startDerivationWorker({
  getRuntimeCoinAdapter,
  runDerivationSelfTest: runDashDerivationSelfTest,
  startupSelfTests: [runLocalSearchSelfTest, runDashMessageSigningSelfTest],
  fullSelfTests: [runDashBip38FullSelfTest],
  encryptDerivedP2pkhKey,
  signDerivedMessage,
});
