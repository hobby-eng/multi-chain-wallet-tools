import { bip44CoinAdapter } from "./bip44-coin.js";
import { ZCASH_PROFILES } from "../zcash/profiles.js";

/** Zcash's page adapters, one per variant of the Derivation type tabs. */
export const ZCASH_COIN_ADAPTERS = ZCASH_PROFILES.map((profile) => bip44CoinAdapter(profile));
