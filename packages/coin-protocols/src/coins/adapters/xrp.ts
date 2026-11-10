import { bip44CoinAdapter } from "./bip44-coin.js";
import { XRP_PROFILES } from "../xrp/profiles.js";

/** XRP's page adapters, one per variant of the Derivation type tabs. */
export const XRP_COIN_ADAPTERS = XRP_PROFILES.map((profile) => bip44CoinAdapter(profile));
