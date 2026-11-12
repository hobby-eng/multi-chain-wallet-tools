import { getRuntimeCoinAdapter } from "@ckd/coins/runtime-registry.js";
import { runDerivationSelfTest } from "@ckd/derivation-self-test";
import { runLocalSearchSelfTest } from "@ckd/verification/local-search-self-test.js";
import { startDerivationWorker } from "./worker-runtime.js";
import { deriveSilentPayment } from "./silent-payment.js";
import { deriveMultisigWallet } from "./multisig-wallet.js";
import { Bip85 } from "@ckd/core/bip85.js";
import { encryptDerivedP2pkhKey } from "./bip38-encrypter.js";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { BITCOIN_MESSAGE_SIGNING } from "@ckd/coins/bitcoin/message-signing.js";
import { DASH_MESSAGE_SIGNING } from "@ckd/coins/dash/message-signing.js";
import { runBip85SelfTest } from "./bip85-self-test.js";
import { runBitcoinBip38FullSelfTest } from "./bip38-self-test-bitcoin.js";
import { runDashBip38FullSelfTest } from "./bip38-self-test-dash.js";
import {
  runBip322FullSelfTest,
  runBitcoinMessageSigningSelfTest,
} from "./message-signer-self-test-bitcoin.js";
import { runDashMessageSigningSelfTest } from "./message-signer-self-test-dash.js";
import { runDashMasternodeFullSelfTest } from "./masternode-self-test-dash.js";
import { runSilentPaymentSelfTest } from "./silent-payment-self-test.js";
import { runTonKeyFullSelfTest } from "./ton-key-self-test.js";

const messageSigners = new MessageSigners([BITCOIN_MESSAGE_SIGNING, DASH_MESSAGE_SIGNING]);

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
  fullSelfTests: [
    runBip322FullSelfTest,
    runBitcoinBip38FullSelfTest,
    runDashBip38FullSelfTest,
    runDashMasternodeFullSelfTest,
    runTonKeyFullSelfTest,
  ],
  signDerivedMessage: messageSigners.sign,
  verifyDerivedMessage: messageSigners.verify,
  deriveSilentPayment,
  deriveBip85: (seed, options) => Bip85.derive(seed, options),
  encryptDerivedP2pkhKey,
  deriveMultisigWallet,
});
