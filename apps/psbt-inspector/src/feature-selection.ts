import { installBip38Feature } from './bip38-feature.js';
import { installMessageVerificationFeature } from './message-verification-feature.js';
import { installMultisigWalletFeature } from './multisig-wallet-feature.js';
import { installPolicyBuilderFeature } from './policy-builder-feature.js';
import { installPsbtDecoderFeature } from './psbt-decoder-feature.js';
import { installScriptDecoderFeature } from './script-decoder-feature.js';

export function installSelectedPsbtFeatures(): void {
  installPsbtDecoderFeature();
  installScriptDecoderFeature({ script: true, descriptor: true });
  installPolicyBuilderFeature();
  installMultisigWalletFeature();
  installMessageVerificationFeature();
  installBip38Feature();
}
