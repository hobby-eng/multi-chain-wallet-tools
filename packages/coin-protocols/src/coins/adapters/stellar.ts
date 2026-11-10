import { ed25519CoinAdapter } from "./ed25519-coin.js";
import { STELLAR_PROFILES } from "../stellar/profiles.js";

/** Stellar's page adapter. */
export const STELLAR_COIN_ADAPTERS = STELLAR_PROFILES.map((profile) => ed25519CoinAdapter(profile));
