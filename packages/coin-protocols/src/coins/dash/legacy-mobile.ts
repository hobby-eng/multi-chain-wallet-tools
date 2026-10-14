import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";
import { deriveDashP2pkhChain, type DashP2pkhChain } from "./p2pkh-chain.js";
import { DASH_LEGACY_MOBILE_PATHS } from "./profiles.js";

/** Historical Dash Wallet/DashSync mobile path: m/account'/branch/index. */
const DASH_LEGACY_MOBILE: DashP2pkhChain = {
  id: "dash-legacy-mobile",
  title: () => "Dash Core · legacy mobile",
  addressLabel: "Dash legacy mobile address",
  paths: DASH_LEGACY_MOBILE_PATHS,
  summaryLabels: {
    accountPath: "Legacy mobile account path",
    accountXprv: "Legacy mobile account xprv",
    accountXpub: "Legacy mobile account xpub",
  },
  fileStem: "dash-legacy-mobile",
  scannerPrefix: "dash-legacy-xpub",
  watchOnly: (chain, options) => ({
    label: "Copy public scan key",
    description:
      "Import this labelled public key into Discovery Scanner to scan this legacy mobile branch. It cannot spend, but exposes branch addresses and activity.",
    text: `dash-legacy-xpub:${chain.branch.publicExtendedKey}`,
    fileName: `dash-legacy-${options.network}-account-${options.account}-branch-${options.branch}.txt`,
    mimeType: "text/plain",
    privacySensitive: true,
  }),
  notices: [
    "Historical Dash Wallet/DashSync mobile path m/account'/branch/index. Account 0 is the historical default. Use it only for recovery of wallets that predate the BIP44 mobile default.",
  ],
};

export function deriveDashLegacyMobile(options: Bip32BatchOptions): DerivationResult {
  return deriveDashP2pkhChain(DASH_LEGACY_MOBILE, options);
}
