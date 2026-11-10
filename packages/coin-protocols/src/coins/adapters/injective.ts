import { bip44CoinAdapter } from "./bip44-coin.js";
import { INJECTIVE_PROFILES } from "../injective/profiles.js";

/** Injective's page adapters, one per variant of the Derivation type tabs. */
export const INJECTIVE_COIN_ADAPTERS = INJECTIVE_PROFILES.map((profile) =>
  bip44CoinAdapter(profile),
);
