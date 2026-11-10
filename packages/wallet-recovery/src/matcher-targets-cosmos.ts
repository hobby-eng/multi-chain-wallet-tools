import { COSMOS_HRP } from "@ckd/coins/cosmos/profiles.js";
import { bech32Hash, singleKeyMatcher } from "./matcher-targets-single-key.js";

/** The Cosmos Hub's part of the matcher: cosmos1… accounts. */
export const COSMOS_MATCHER = singleKeyMatcher(["cosmos"], (value) =>
  bech32Hash(value, COSMOS_HRP) === null
    ? null
    : { normalized: value.toLowerCase(), adapterIds: ["cosmos"] },
);
