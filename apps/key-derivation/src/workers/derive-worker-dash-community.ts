import { getRuntimeCoinAdapter } from "@ckd/coins/dash-runtime-registry.js";
import { runDashDerivationSelfTest } from "@ckd/dash-derivation-self-test";
import { runLocalSearchSelfTest } from "@ckd/verification/local-search-self-test.js";
import { startDerivationWorker } from "./worker-runtime.js";
import { encryptDerivedP2pkhKey } from "./bip38-encrypter-dash.js";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { DASH_MESSAGE_SIGNING } from "@ckd/coins/dash/message-signing.js";
import { deriveMultisigWallet } from "./multisig-wallet-dash.js";
import { runDashBip38FullSelfTest } from "./bip38-self-test-dash.js";
import { runDashMessageSigningSelfTest } from "./message-signer-self-test-dash.js";
import { runDashMasternodeFullSelfTest } from "./masternode-self-test-dash.js";

const messageSigners = new MessageSigners([DASH_MESSAGE_SIGNING]);

startDerivationWorker({
  getRuntimeCoinAdapter,
  runDerivationSelfTest: runDashDerivationSelfTest,
  startupSelfTests: [runLocalSearchSelfTest, runDashMessageSigningSelfTest],
  fullSelfTests: [runDashBip38FullSelfTest, runDashMasternodeFullSelfTest],
  encryptDerivedP2pkhKey,
  signDerivedMessage: messageSigners.sign,
  verifyDerivedMessage: messageSigners.verify,
  admitMessageSigning: messageSigners.admit,
  deriveMultisigWallet,
});
