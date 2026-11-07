// The multisig schemes of a build with Bitcoin and without Dash.
import { BITCOIN_MULTISIG_SCHEMES } from "@ckd/coins/bitcoin/multisig-wallet.js";
import {
  deriveMultisigWallet as derive,
  type MultisigWalletOptions,
} from "@ckd/coins/multisig-wallet.js";

export function deriveMultisigWallet(seeds: readonly Uint8Array[], options: MultisigWalletOptions) {
  return derive(seeds, options, BITCOIN_MULTISIG_SCHEMES);
}
