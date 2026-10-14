import { installBip38Feature } from "./bip38-feature.js";
import { installMessageVerificationFeature } from "./message-verification-feature.js";
import { installMultisigWalletFeature } from "./multisig-wallet-feature.js";
import { installPolicyBuilderFeature } from "./policy-builder-feature.js";
import { installPsbtDecoderFeature } from "./psbt-decoder-feature.js";
import { installScriptDecoderFeature } from "./script-decoder-feature.js";
import type { SelectedSelfTests } from "./self-test.js";
import * as bitcoin from "./self-test-bitcoin.js";
import * as dash from "./self-test-dash.js";

export function installSelectedPsbtFeatures(): void {
  installPsbtDecoderFeature();
  installScriptDecoderFeature({ script: true, descriptor: true });
  installPolicyBuilderFeature();
  installMultisigWalletFeature();
  installMessageVerificationFeature();
  installBip38Feature();
}

/** Every feature's known answers for both coins, as the build composes them for a selection. */
export function selectedSelfTests(): SelectedSelfTests {
  return {
    startup: [
      bitcoin.bitcoinPsbtDecoder,
      dash.dashPsbtDecoder,
      bitcoin.bitcoinScriptDecoder,
      dash.dashScriptDecoder,
      bitcoin.bitcoinDescriptorDecoder,
      bitcoin.bitcoinPolicyBuilder,
      dash.dashPolicyBuilder,
      bitcoin.bitcoinMultisigWallet,
      dash.dashMultisigWallet,
      bitcoin.bitcoinMessageVerification,
      dash.dashMessageVerification,
    ],
    full: [bitcoin.bitcoinBip322Verification, bitcoin.bitcoinBip38Decrypt, dash.dashBip38Decrypt],
  };
}
