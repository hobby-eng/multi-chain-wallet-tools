import { ZCASH_ADDRESS } from "@ckd/coins/zcash/profiles.js";
import { base58Hash } from "@ckd/core/crypto.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/** Zcash's part of the matcher: transparent t1… addresses. */
export const ZCASH_MATCHER = singleKeyMatcher(["zcash"], (value) =>
  base58Hash(value, ZCASH_ADDRESS.t1) === null
    ? null
    : { normalized: value, adapterIds: ["zcash"] },
);
