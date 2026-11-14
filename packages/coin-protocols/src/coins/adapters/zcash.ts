import type { CoinAdapter, CoinFieldRoles } from "../registry-base.js";
import { bip44CoinAdapter } from "./bip44-coin.js";
import { ZCASH_PROFILES, ZCASH_SAPLING_PROFILE } from "../zcash/profiles.js";

/**
 * The Sapling rows' fields that the page's exports read: the addresses, the transparent receiver
 * among them. A row has no key of its own; the account's keys are in the summary.
 */
const SAPLING_FIELD_ROLES: CoinFieldRoles = Object.freeze({
  addresses: ["address", "unifiedAddress", "unifiedTransparentAddress", "transparentReceiver"],
  publicKeys: [],
  privateKeys: [],
});

/** The page's adapter of Zcash's Sapling variant: mainnet only, an account and diversifier indexes. */
const ZCASH_SAPLING_ADAPTER: CoinAdapter = {
  id: ZCASH_SAPLING_PROFILE.adapterId,
  group: ZCASH_SAPLING_PROFILE.group,
  fixedPathLabels: ["ZIP-32 purpose", "Coin type"],
  label: ZCASH_SAPLING_PROFILE.label,
  variantLabel: ZCASH_SAPLING_PROFILE.variantLabel,
  defaultVariant: ZCASH_SAPLING_PROFILE.defaultVariant,
  networkControl: false,
  // Every index has a row, its address or the statement that it has none, as the page's batches
  // of consecutive indexes expect.
  controlLabels: { start: "First diversifier index", count: "Number of indexes" },
  defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 20 },
  fieldRoles: SAPLING_FIELD_ROLES,
  pathPreview: (input) => ZCASH_SAPLING_PROFILE.pathPreview(input),
};

/** Zcash's page adapters, one per variant of the Derivation type tabs: transparent, then Sapling. */
export const ZCASH_COIN_ADAPTERS: readonly CoinAdapter[] = [
  ...ZCASH_PROFILES.map((profile) => bip44CoinAdapter(profile)),
  ZCASH_SAPLING_ADAPTER,
];
