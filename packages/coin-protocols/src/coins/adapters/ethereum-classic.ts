import { hexAddressesEqual } from "../registry-base.js";
import { bip44CoinAdapter } from "./bip44-coin.js";
import { ETHEREUM_CLASSIC_PROFILES } from "../ethereum-classic/profiles.js";

/** Ethereum Classic's page adapter; addresses compare without regard to EIP-55 case. */
export const ETHEREUM_CLASSIC_COIN_ADAPTERS = ETHEREUM_CLASSIC_PROFILES.map((profile) =>
  bip44CoinAdapter(profile, hexAddressesEqual),
);
