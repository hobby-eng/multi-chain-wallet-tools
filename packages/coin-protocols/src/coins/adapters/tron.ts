import { bip44CoinAdapter } from "./bip44-coin.js";
import { TRON_PROFILES } from "../tron/profiles.js";

/** Tron's page adapters, one per variant of the Derivation type tabs. */
export const TRON_COIN_ADAPTERS = TRON_PROFILES.map((profile) => bip44CoinAdapter(profile));
