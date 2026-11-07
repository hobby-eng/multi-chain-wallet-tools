// The multisig schemes of a build with Bitcoin and Dash; a Dash-only build composes
// multisig-wallet-dash.ts instead, which carries no other coin's scheme.
import { BITCOIN_MULTISIG_SCHEMES } from "@ckd/coins/bitcoin/multisig-wallet.js";
import { DASH_P2SH_MULTISIG } from "@ckd/coins/dash/multisig-wallet.js";
import {
  deriveMultisigWallet as derive,
  type MultisigWalletOptions,
} from "@ckd/coins/multisig-wallet.js";

const SCHEMES = [DASH_P2SH_MULTISIG, ...BITCOIN_MULTISIG_SCHEMES];

export function deriveMultisigWallet(seeds: readonly Uint8Array[], options: MultisigWalletOptions) {
  return derive(seeds, options, SCHEMES);
}
