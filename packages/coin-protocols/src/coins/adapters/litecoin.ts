import { bip44CoinAdapter } from "./bip44-coin.js";
import { LITECOIN_PROFILES } from "../litecoin/profiles.js";

/** Litecoin's page adapters, one per variant of the Derivation type tabs. */
export const LITECOIN_COIN_ADAPTERS = LITECOIN_PROFILES.map((profile) => bip44CoinAdapter(profile));
