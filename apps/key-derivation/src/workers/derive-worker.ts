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
import { LITECOIN_MESSAGE_SIGNING } from "@ckd/coins/litecoin/message-signing.js";
import { DOGECOIN_MESSAGE_SIGNING } from "@ckd/coins/dogecoin/message-signing.js";
import { BITCOIN_CASH_MESSAGE_SIGNING } from "@ckd/coins/bitcoin-cash/message-signing.js";
import { ZCASH_MESSAGE_SIGNING } from "@ckd/coins/zcash/message-signing.js";
import { runBip85SelfTest } from "./bip85-self-test.js";
import { runBitcoinBip38FullSelfTest } from "./bip38-self-test-bitcoin.js";
import { runDashBip38FullSelfTest } from "./bip38-self-test-dash.js";
import {
  runBip322FullSelfTest,
  runBitcoinMessageSigningSelfTest,
} from "./message-signer-self-test-bitcoin.js";
import { runDashMessageSigningSelfTest } from "./message-signer-self-test-dash.js";
import {
  runLitecoinMessageSigningFullSelfTest,
  runLitecoinMessageSigningSelfTest,
} from "./message-signer-self-test-litecoin.js";
import {
  runDogecoinMessageSigningFullSelfTest,
  runDogecoinMessageSigningSelfTest,
} from "./message-signer-self-test-dogecoin.js";
import {
  runBitcoinCashMessageSigningFullSelfTest,
  runBitcoinCashMessageSigningSelfTest,
} from "./message-signer-self-test-bitcoin-cash.js";
import {
  runZcashMessageSigningFullSelfTest,
  runZcashMessageSigningSelfTest,
} from "./message-signer-self-test-zcash.js";
import { runDashMasternodeFullSelfTest } from "./masternode-self-test-dash.js";
import { runSilentPaymentSelfTest } from "./silent-payment-self-test.js";
import { runTonKeyFullSelfTest } from "./ton-key-self-test.js";

const messageSigners = new MessageSigners([
  BITCOIN_MESSAGE_SIGNING,
  DASH_MESSAGE_SIGNING,
  LITECOIN_MESSAGE_SIGNING,
  DOGECOIN_MESSAGE_SIGNING,
  BITCOIN_CASH_MESSAGE_SIGNING,
  ZCASH_MESSAGE_SIGNING,
]);

startDerivationWorker({
  getRuntimeCoinAdapter,
  runDerivationSelfTest,
  startupSelfTests: [
    runLocalSearchSelfTest,
    runSilentPaymentSelfTest,
    runBip85SelfTest,
    runBitcoinMessageSigningSelfTest,
    runDashMessageSigningSelfTest,
    runLitecoinMessageSigningSelfTest,
    runDogecoinMessageSigningSelfTest,
    runBitcoinCashMessageSigningSelfTest,
    runZcashMessageSigningSelfTest,
  ],
  fullSelfTests: [
    runBip322FullSelfTest,
    runLitecoinMessageSigningFullSelfTest,
    runDogecoinMessageSigningFullSelfTest,
    runBitcoinCashMessageSigningFullSelfTest,
    runZcashMessageSigningFullSelfTest,
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
