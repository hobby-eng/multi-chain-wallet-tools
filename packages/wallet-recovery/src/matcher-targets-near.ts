import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/** NEAR's part of the matcher: an implicit account, the 64 hex digits of an Ed25519 key. */
export const NEAR_MATCHER = singleKeyMatcher(["near"], (value) =>
  /^[0-9a-f]{64}$/iu.test(value) ? { normalized: value.toLowerCase(), adapterIds: ["near"] } : null,
);
