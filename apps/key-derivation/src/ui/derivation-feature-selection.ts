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

export const installMessageSigningFeature = createMessageSigningInstaller(
  combineMessageSigningPolicies(
    BITCOIN_MESSAGE_SIGNING_POLICY,
    DASH_MESSAGE_SIGNING_POLICY,
    LITECOIN_MESSAGE_SIGNING_POLICY,
    DOGECOIN_MESSAGE_SIGNING_POLICY,
    BITCOIN_CASH_MESSAGE_SIGNING_POLICY,
    ZCASH_MESSAGE_SIGNING_POLICY,
  ),
);
