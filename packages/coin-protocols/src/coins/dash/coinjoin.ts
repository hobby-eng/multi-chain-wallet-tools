import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import { deriveDashP2pkhChain, type DashP2pkhChain } from "./p2pkh-chain.js";
import { DASH_COINJOIN_PATHS, DASH_COINJOIN_PROTOCOL } from "./profiles.js";

/**
 * DIP-0009 CoinJoin chain: m/9'/coin_type'/4'/account'/branch/index. Purpose,
 * coin type, feature, and account are hardened; branch and index are not.
 * This is a separate chain from BIP44 (Dash Core receive/change) and from
 * DIP17/DIP18 (Platform); branch 0 is the external chain (the commonly used
 * mobile/DashSync CoinJoin branch) and branch 1 is the internal chain
 * (a compatibility/defensive branch that is rarely used in practice). Legacy
 * compressed-key P2PKH addresses only -- no Bech32, no DIP18 here.
 */
const DASH_COINJOIN: DashP2pkhChain = {
  id: DASH_COINJOIN_PROTOCOL.workerAdapterId,
  title: (branch) => {
    const chain = branch === DASH_COINJOIN_PROTOCOL.branches.external ? "External" : "Internal";
    return `${DASH_COINJOIN_PROTOCOL.label} · ${chain} chain`;
  },
  addressLabel: "Dash CoinJoin address",
  paths: DASH_COINJOIN_PATHS,
  summaryLabels: {
    accountPath: "DIP9 account path",
    accountXprv: "DIP9 account xprv",
    accountXpub: "DIP9 account xpub",
  },
  fileStem: "dash-coinjoin",
  scannerPrefix: "dash-coinjoin-xpub",
  notices: [
    "DIP-0009 CoinJoin chain, separate from the standard BIP44 receive/change branches used by Dash Core. Legacy compressed-key P2PKH addresses only.",
  ],
};

export function deriveDashCoinJoin(options: Bip32BatchOptions): DerivationResult {
  return deriveDashP2pkhChain(DASH_COINJOIN, options);
}
