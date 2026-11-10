import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** XRP's profile under its coin type 144 (SLIP-44), m/44'/144'/account'/0/index. */
export const XRP_PROFILES = Bip44CoinProfile.single({
  adapterId: "xrp",
  group: "XRP",
  variantLabel: "BIP44",
  coinType: 144,
  branches: "address-branch",
});
