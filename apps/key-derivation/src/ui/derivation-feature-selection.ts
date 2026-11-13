export { installSilentPaymentFeature } from "./silent-payment-feature.js";
export { installBip85Feature } from "./bip85-feature.js";
export { installCheckedMnemonicFeature } from "./checked-mnemonic-feature.js";
export { installTonPhraseFeature } from "./ton-phrase-feature.js";
import { createBip38EncryptionInstaller } from "./bip38-encryption-feature.js";

export const installBip38EncryptionFeature = createBip38EncryptionInstaller([
  "bitcoin-legacy",
  "dash-core",
  "dash-legacy-mobile",
  "dash-core-coinjoin",
]);
import { createMessageSigningInstaller } from "./message-signing-feature.js";
import { combineMessageSigningPolicies } from "./message-signing-policy.js";
import { BITCOIN_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-bitcoin.js";
import { DASH_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-dash.js";
import { LITECOIN_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-litecoin.js";
import { DOGECOIN_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-dogecoin.js";
import { BITCOIN_CASH_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-bitcoin-cash.js";
import { ZCASH_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-zcash.js";
import { ETHEREUM_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-ethereum.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-ethereum-classic.js";
import { TRON_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-tron.js";
import { SOLANA_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-solana.js";
import { STELLAR_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-stellar.js";
import { NEAR_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-near.js";
import { TON_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-ton.js";
import { COSMOS_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-cosmos.js";
import { INJECTIVE_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-injective.js";
import { HEDERA_MESSAGE_SIGNING_POLICY } from "./message-signing-policy-hedera.js";

export const installMessageSigningFeature = createMessageSigningInstaller(
  combineMessageSigningPolicies(
    BITCOIN_MESSAGE_SIGNING_POLICY,
    DASH_MESSAGE_SIGNING_POLICY,
    LITECOIN_MESSAGE_SIGNING_POLICY,
    DOGECOIN_MESSAGE_SIGNING_POLICY,
    BITCOIN_CASH_MESSAGE_SIGNING_POLICY,
    ZCASH_MESSAGE_SIGNING_POLICY,
    ETHEREUM_MESSAGE_SIGNING_POLICY,
    ETHEREUM_CLASSIC_MESSAGE_SIGNING_POLICY,
    TRON_MESSAGE_SIGNING_POLICY,
    SOLANA_MESSAGE_SIGNING_POLICY,
    STELLAR_MESSAGE_SIGNING_POLICY,
    NEAR_MESSAGE_SIGNING_POLICY,
    TON_MESSAGE_SIGNING_POLICY,
    COSMOS_MESSAGE_SIGNING_POLICY,
    INJECTIVE_MESSAGE_SIGNING_POLICY,
    HEDERA_MESSAGE_SIGNING_POLICY,
  ),
);
