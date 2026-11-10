import {
  ADDRESS_BRANCH_CONTROL,
  BIP44_ADDRESS_BRANCHES,
  TRANSPARENT_ROLES,
  type CoinAdapter,
} from "../registry-base.js";
import type { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** The page's adapter of one BIP44-coin variant: mainnet only, BIP44 accounts and branches. */
export function bip44CoinAdapter(
  profile: Bip44CoinProfile,
  addressesEqual?: CoinAdapter["addressesEqual"],
): CoinAdapter {
  const branches =
    profile.branches === "receive-change"
      ? { addressBranches: BIP44_ADDRESS_BRANCHES }
      : { branchControl: ADDRESS_BRANCH_CONTROL };
  return {
    id: profile.adapterId,
    group: profile.group,
    fixedPathLabels: ["Purpose", "Coin type"],
    label: profile.label,
    variantLabel: profile.variantLabel,
    defaultVariant: profile.defaultVariant,
    networkControl: false,
    ...branches,
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    ...(addressesEqual === undefined ? {} : { addressesEqual }),
    pathPreview: (input) => profile.paths.pathPreview(input),
  };
}
