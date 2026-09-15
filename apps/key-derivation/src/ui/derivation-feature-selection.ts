export { installSilentPaymentFeature } from './silent-payment-feature.js';
export { installBip85Feature } from './bip85-feature.js';
import { createBip38EncryptionInstaller } from './bip38-encryption-feature.js';

export const installBip38EncryptionFeature = createBip38EncryptionInstaller([
  'bitcoin-legacy',
  'dash-core',
  'dash-legacy-mobile',
  'dash-core-coinjoin',
]);
import { createMessageSigningInstaller } from './message-signing-feature.js';
import { combineMessageSigningPolicies } from './message-signing-policy.js';
import { BITCOIN_MESSAGE_SIGNING_POLICY } from './message-signing-policy-bitcoin.js';
import { DASH_MESSAGE_SIGNING_POLICY } from './message-signing-policy-dash.js';

export const installMessageSigningFeature = createMessageSigningInstaller(
  combineMessageSigningPolicies(BITCOIN_MESSAGE_SIGNING_POLICY, DASH_MESSAGE_SIGNING_POLICY),
);
