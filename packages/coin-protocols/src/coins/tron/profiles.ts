import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** Tron's profile under its coin type 195 (SLIP-44), m/44'/195'/account'/0/index. */
export const TRON_PROFILES = Bip44CoinProfile.single({
  adapterId: "tron",
  group: "Tron",
  variantLabel: "BIP44",
  coinType: 195,
  branches: "address-branch",
});

/** Tron's mainnet address prefix: base58check of 0x41 and the Keccak account bytes ("T…"). */
export const TRON_ADDRESS_PREFIX = 0x41;
