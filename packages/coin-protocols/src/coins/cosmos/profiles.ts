import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** The Cosmos Hub's profile under its coin type 118 (SLIP-44), as Keplr and the Cosmos SDK derive it. */
export const COSMOS_PROFILES = Bip44CoinProfile.single({
  adapterId: "cosmos",
  group: "Cosmos",
  variantLabel: "BIP44",
  coinType: 118,
  branches: "address-branch",
});

/** The Cosmos Hub's bech32 account prefix. */
export const COSMOS_HRP = "cosmos";
