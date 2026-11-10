import { bip44CoinAdapter } from "./bip44-coin.js";
import { DOGECOIN_PROFILES } from "../dogecoin/profiles.js";

/** Dogecoin's page adapters, one per variant of the Derivation type tabs. */
export const DOGECOIN_COIN_ADAPTERS = DOGECOIN_PROFILES.map((profile) => bip44CoinAdapter(profile));
