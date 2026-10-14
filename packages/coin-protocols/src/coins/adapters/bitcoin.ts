import { BIP44_ADDRESS_BRANCHES, TRANSPARENT_ROLES, type CoinAdapter } from "../registry-base.js";
import { BITCOIN_PROFILES, type BitcoinPurposeProfile } from "../bitcoin/profiles.js";

function bitcoinAdapter(profile: BitcoinPurposeProfile): CoinAdapter {
  return {
    id: profile.adapterId,
    group: "Bitcoin",
    fixedPathLabels: ["Purpose", "Coin type"],
    label: profile.adapterLabel,
    variantLabel: profile.label,
    defaultVariant: profile.defaultVariant,
    networkControl: true,
    addressBranches: BIP44_ADDRESS_BRANCHES,
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: (input) => profile.paths.pathPreview(input),
  };
}

export const BITCOIN_COIN_ADAPTERS: readonly CoinAdapter[] = BITCOIN_PROFILES.map(bitcoinAdapter);
