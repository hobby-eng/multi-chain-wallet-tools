import { canonicalNearImplicitAccount } from "@ckd/coins/near/account.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/** NEAR's part of the matcher: an implicit account, the 64 hex digits of an Ed25519 key. */
export const NEAR_MATCHER = singleKeyMatcher(["near"], (value) => {
  const normalized = canonicalNearImplicitAccount(value);
  return normalized === null ? null : { normalized, adapterIds: ["near"] };
});
