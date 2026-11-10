import { ed25519CoinAdapter } from "./ed25519-coin.js";
import { NEAR_PROFILES } from "../near/profiles.js";

/** NEAR's page adapter. */
export const NEAR_COIN_ADAPTERS = NEAR_PROFILES.map((profile) => ed25519CoinAdapter(profile));
