import { xrpAccountIdOf } from "@ckd/coins/xrp/address.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/** XRP's part of the matcher: classic r… addresses. */
export const XRP_MATCHER = singleKeyMatcher(["xrp"], (value) =>
  xrpAccountIdOf(value) === null ? null : { normalized: value, adapterIds: ["xrp"] },
);
