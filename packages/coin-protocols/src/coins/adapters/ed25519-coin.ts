import { TRANSPARENT_ROLES, type CoinAdapter } from "../registry-base.js";
import type { Ed25519CoinProfile } from "../ed25519-coin-profile.js";

/** The page's adapter of one Ed25519 variant: mainnet only, the row index as its only control. */
export function ed25519CoinAdapter(profile: Ed25519CoinProfile): CoinAdapter {
  return {
    id: profile.adapterId,
    group: profile.group,
    label: profile.label,
    variantLabel: profile.variantLabel,
    defaultVariant: profile.defaultVariant,
    networkControl: false,
    accountControl: false,
    controlLabels: { start: "Start index", count: "Number of keys" },
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: (input) => profile.pathPreview(input),
  };
}
