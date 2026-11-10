import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** Injective's profile: Ethereum's coin type 60, as Injective's wallets derive its eth_secp256k1 keys. */
export const INJECTIVE_PROFILES = Bip44CoinProfile.single({
  adapterId: "injective",
  group: "Injective",
  variantLabel: "BIP44 · coin type 60",
  coinType: 60,
  branches: "address-branch",
});

/** Injective's bech32 account prefix. */
export const INJECTIVE_HRP = "inj";
