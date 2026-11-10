import { TRON_ADDRESS_PREFIX } from "@ckd/coins/tron/profiles.js";
import { base58Hash, singleKeyMatcher } from "./matcher-targets-single-key.js";

/** Tron's part of the matcher: T… addresses. */
export const TRON_MATCHER = singleKeyMatcher(["tron"], (value) =>
  base58Hash(value, [TRON_ADDRESS_PREFIX]) === null
    ? null
    : { normalized: value, adapterIds: ["tron"] },
);
