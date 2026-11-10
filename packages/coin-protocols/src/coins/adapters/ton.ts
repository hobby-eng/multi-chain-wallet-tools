import { TRANSPARENT_ROLES, type CoinAdapter } from "../registry-base.js";
import { tonAddressesEqual } from "../ton/address.js";
import { TON_BIP39_PROFILES, TON_STANDARD_ADAPTER, TON_STANDARD_PATH } from "../ton/profiles.js";
import { ed25519CoinAdapter } from "./ed25519-coin.js";

/**
 * The Telegram wallet's variant: the one key of a TON phrase, derived from the phrase's own entropy
 * instead of a BIP39 seed, so a phrase that is not TON's has none.
 */
const TON_STANDARD_COIN_ADAPTER: CoinAdapter = {
  id: TON_STANDARD_ADAPTER,
  group: "TON",
  label: "TON Telegram wallet · TON phrase",
  variantLabel: "Telegram wallet · TON phrase",
  seedSource: "ton-phrase",
  networkControl: false,
  accountControl: false,
  rangeControl: false,
  limits: { startMax: 0 },
  defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 1 },
  fieldRoles: TRANSPARENT_ROLES,
  addressesEqual: tonAddressesEqual,
  pathPreview: ({ start, count }) => {
    if (start !== 0 || count !== 1) throw new RangeError("A TON phrase has one key.");
    return TON_STANDARD_PATH;
  },
};

/** TON's page adapters, the Derivation type tabs Telegram wallet, Trust Wallet and Ledger. */
export const TON_COIN_ADAPTERS: readonly CoinAdapter[] = [
  TON_STANDARD_COIN_ADAPTER,
  ...TON_BIP39_PROFILES.map((profile) => ({
    ...ed25519CoinAdapter(profile),
    addressesEqual: tonAddressesEqual,
  })),
];
