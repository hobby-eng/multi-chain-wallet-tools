import { bip44CoinAdapter } from "./bip44-coin.js";
import { COSMOS_PROFILES } from "../cosmos/profiles.js";

/** Cosmos's page adapters, one per variant of the Derivation type tabs. */
export const COSMOS_COIN_ADAPTERS = COSMOS_PROFILES.map((profile) => bip44CoinAdapter(profile));
