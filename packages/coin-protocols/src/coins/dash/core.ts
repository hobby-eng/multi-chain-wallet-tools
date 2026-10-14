import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import { deriveDashP2pkhChain, type DashP2pkhChain } from "./p2pkh-chain.js";
import { DASH_CORE_PATHS } from "./profiles.js";

/** Dash Core's BIP44 account: m/44'/coin_type'/account'/branch/index. */
const DASH_CORE: DashP2pkhChain = {
  id: "dash-core",
  title: () => "Dash Core (BIP44 / P2PKH)",
  addressLabel: "Dash Core address",
  paths: DASH_CORE_PATHS,
  fileStem: "dash-core",
  scannerPrefix: "dash-core-xpub",
  notices: [],
};

export function deriveDashCore(options: Bip32BatchOptions): DerivationResult {
  return deriveDashP2pkhChain(DASH_CORE, options);
}
