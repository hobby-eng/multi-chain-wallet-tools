// The multisig scheme of a Dash-only build: Dash P2SH, with its Core and Platform addresses.
import { DASH_P2SH_MULTISIG } from "@ckd/coins/dash/multisig-wallet.js";
import {
  deriveMultisigWallet as derive,
  type MultisigWalletOptions,
} from "@ckd/coins/multisig-wallet.js";

export function deriveMultisigWallet(seeds: readonly Uint8Array[], options: MultisigWalletOptions) {
  return derive(seeds, options, [DASH_P2SH_MULTISIG]);
}
