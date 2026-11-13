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
import { ETHEREUM_MESSAGE_SIGNING } from "@ckd/coins/ethereum/message-signing.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING } from "@ckd/coins/ethereum-classic/message-signing.js";
import { TRON_MESSAGE_SIGNING } from "@ckd/coins/tron/message-signing.js";
import { SOLANA_MESSAGE_SIGNING } from "@ckd/coins/solana/message-signing.js";
import { STELLAR_MESSAGE_SIGNING } from "@ckd/coins/stellar/message-signing.js";
import { NEAR_MESSAGE_SIGNING } from "@ckd/coins/near/message-signing.js";
import { TON_MESSAGE_SIGNING } from "@ckd/coins/ton/message-signing.js";
import { COSMOS_MESSAGE_SIGNING } from "@ckd/coins/cosmos/message-signing.js";
import { INJECTIVE_MESSAGE_SIGNING } from "@ckd/coins/injective/message-signing.js";
import { HEDERA_MESSAGE_SIGNING } from "@ckd/coins/hedera/message-signing.js";
import { CARDANO_MESSAGE_SIGNING } from "@ckd/coins/cardano/message-signing.js";
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
import {
  runEthereumMessageSigningFullSelfTest,
  runEthereumMessageSigningSelfTest,
} from "./message-signer-self-test-ethereum.js";
import {
  runEthereumClassicMessageSigningFullSelfTest,
  runEthereumClassicMessageSigningSelfTest,
} from "./message-signer-self-test-ethereum-classic.js";
import { runTronMessageSigningSelfTest } from "./message-signer-self-test-tron.js";
import {
  runSolanaMessageSigningFullSelfTest,
  runSolanaMessageSigningSelfTest,
} from "./message-signer-self-test-solana.js";
import {
  runStellarMessageSigningFullSelfTest,
  runStellarMessageSigningSelfTest,
} from "./message-signer-self-test-stellar.js";
import {
  runNearMessageSigningFullSelfTest,
  runNearMessageSigningSelfTest,
} from "./message-signer-self-test-near.js";
import {
  runTonMessageSigningFullSelfTest,
  runTonMessageSigningSelfTest,
} from "./message-signer-self-test-ton.js";
import { runCosmosMessageSigningSelfTest } from "./message-signer-self-test-cosmos.js";
import { runInjectiveMessageSigningSelfTest } from "./message-signer-self-test-injective.js";
import { runHederaMessageSigningSelfTest } from "./message-signer-self-test-hedera.js";
import {
  runCardanoMessageSigningFullSelfTest,
  runCardanoMessageSigningSelfTest,
} from "./message-signer-self-test-cardano.js";
import { runDashMasternodeFullSelfTest } from "./masternode-self-test-dash.js";
import { runSilentPaymentSelfTest } from "./silent-payment-self-test.js";
import { runTonKeyFullSelfTest } from "./ton-key-self-test.js";
import { runCardanoKeyFullSelfTest } from "./cardano-key-self-test.js";

const messageSigners = new MessageSigners([
  BITCOIN_MESSAGE_SIGNING,
  DASH_MESSAGE_SIGNING,
  LITECOIN_MESSAGE_SIGNING,
  DOGECOIN_MESSAGE_SIGNING,
  BITCOIN_CASH_MESSAGE_SIGNING,
  ZCASH_MESSAGE_SIGNING,
  ETHEREUM_MESSAGE_SIGNING,
  ETHEREUM_CLASSIC_MESSAGE_SIGNING,
  TRON_MESSAGE_SIGNING,
  SOLANA_MESSAGE_SIGNING,
  STELLAR_MESSAGE_SIGNING,
  NEAR_MESSAGE_SIGNING,
  TON_MESSAGE_SIGNING,
  COSMOS_MESSAGE_SIGNING,
  INJECTIVE_MESSAGE_SIGNING,
  HEDERA_MESSAGE_SIGNING,
  CARDANO_MESSAGE_SIGNING,
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
    runEthereumMessageSigningSelfTest,
    runEthereumClassicMessageSigningSelfTest,
    runTronMessageSigningSelfTest,
    runSolanaMessageSigningSelfTest,
    runStellarMessageSigningSelfTest,
    runNearMessageSigningSelfTest,
    runTonMessageSigningSelfTest,
    runCosmosMessageSigningSelfTest,
    runInjectiveMessageSigningSelfTest,
    runHederaMessageSigningSelfTest,
    runCardanoMessageSigningSelfTest,
  ],
  fullSelfTests: [
    runBip322FullSelfTest,
    runLitecoinMessageSigningFullSelfTest,
    runDogecoinMessageSigningFullSelfTest,
    runBitcoinCashMessageSigningFullSelfTest,
    runZcashMessageSigningFullSelfTest,
    runEthereumMessageSigningFullSelfTest,
    runEthereumClassicMessageSigningFullSelfTest,
    runSolanaMessageSigningFullSelfTest,
    runStellarMessageSigningFullSelfTest,
    runNearMessageSigningFullSelfTest,
    runTonMessageSigningFullSelfTest,
    runCardanoMessageSigningFullSelfTest,
    runBitcoinBip38FullSelfTest,
    runDashBip38FullSelfTest,
    runDashMasternodeFullSelfTest,
    runTonKeyFullSelfTest,
    runCardanoKeyFullSelfTest,
  ],
  signDerivedMessage: messageSigners.sign,
  verifyDerivedMessage: messageSigners.verify,
  admitMessageSigning: messageSigners.admit,
  deriveSilentPayment,
  deriveBip85: (seed, options) => Bip85.derive(seed, options),
  encryptDerivedP2pkhKey,
  deriveMultisigWallet,
});
