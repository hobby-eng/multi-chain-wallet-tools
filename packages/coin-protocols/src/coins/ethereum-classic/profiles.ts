import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** Ethereum Classic's profile under its coin type 61 (SLIP-44); wallets that keep it at Ethereum's 60 show the Ethereum addresses. */
export const ETHEREUM_CLASSIC_PROFILES = Bip44CoinProfile.single({
  adapterId: "ethereum-classic",
  group: "Ethereum Classic",
  variantLabel: "BIP44 · coin type 61",
  coinType: 61,
  branches: "address-branch",
});
