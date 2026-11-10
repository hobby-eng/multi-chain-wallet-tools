import { ed25519CoinAdapter } from "./ed25519-coin.js";
import { SOLANA_PROFILES } from "../solana/profiles.js";

/** Solana's page adapters, one per variant of the Derivation type tabs. */
export const SOLANA_COIN_ADAPTERS = SOLANA_PROFILES.map((profile) => ed25519CoinAdapter(profile));
