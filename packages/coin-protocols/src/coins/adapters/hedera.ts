import { hexAddressesEqual } from "../registry-base.js";
import { bip44CoinAdapter } from "./bip44-coin.js";
import { ed25519CoinAdapter } from "./ed25519-coin.js";
import { HEDERA_ECDSA_PROFILES, HEDERA_ED25519_PROFILES } from "../hedera/profiles.js";

/** Hedera's page adapters: its Ed25519 keys first, then its ECDSA keys. */
export const HEDERA_COIN_ADAPTERS = [
  ...HEDERA_ED25519_PROFILES.map((profile) => ed25519CoinAdapter(profile)),
  ...HEDERA_ECDSA_PROFILES.map((profile) => bip44CoinAdapter(profile, hexAddressesEqual)),
];
