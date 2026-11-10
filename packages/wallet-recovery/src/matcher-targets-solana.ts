import { solanaPublicKeyOf } from "@ckd/coins/solana/address.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

const ADAPTERS = ["solana", "solana-ledger"];

/** Solana's part of the matcher: a base58 public key, searched on both of its paths. */
export const SOLANA_MATCHER = singleKeyMatcher(ADAPTERS, (value) =>
  solanaPublicKeyOf(value) === null ? null : { normalized: value, adapterIds: ADAPTERS },
);
