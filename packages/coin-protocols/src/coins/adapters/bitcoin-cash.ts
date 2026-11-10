import { bip44CoinAdapter } from "./bip44-coin.js";
import { BITCOIN_CASH_PROFILES } from "../bitcoin-cash/profiles.js";

/** Bitcoin Cash's page adapters, one per variant of the Derivation type tabs. */
export const BITCOIN_CASH_COIN_ADAPTERS = BITCOIN_CASH_PROFILES.map((profile) =>
  bip44CoinAdapter(profile),
);
