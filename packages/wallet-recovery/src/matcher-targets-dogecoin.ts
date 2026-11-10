import { DOGECOIN_ADDRESS } from "@ckd/coins/dogecoin/profiles.js";
import { base58Hash, singleKeyMatcher } from "./matcher-targets-single-key.js";

/** Dogecoin's part of the matcher: D… addresses. */
export const DOGECOIN_MATCHER = singleKeyMatcher(["dogecoin"], (value) =>
  base58Hash(value, [DOGECOIN_ADDRESS.p2pkh]) === null
    ? null
    : { normalized: value, adapterIds: ["dogecoin"] },
);
