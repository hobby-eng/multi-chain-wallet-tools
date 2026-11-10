import { isStellarAccountId } from "@ckd/coins/stellar/strkey.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/** Stellar's part of the matcher: G… account IDs. */
export const STELLAR_MATCHER = singleKeyMatcher(["stellar"], (value) =>
  isStellarAccountId(value) ? { normalized: value, adapterIds: ["stellar"] } : null,
);
