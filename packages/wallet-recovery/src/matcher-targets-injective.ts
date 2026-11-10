import { INJECTIVE_HRP } from "@ckd/coins/injective/profiles.js";
import { bech32Hash, singleKeyMatcher } from "./matcher-targets-single-key.js";

/** Injective's part of the matcher: inj1… accounts. */
export const INJECTIVE_MATCHER = singleKeyMatcher(["injective"], (value) =>
  bech32Hash(value, INJECTIVE_HRP) === null
    ? null
    : { normalized: value.toLowerCase(), adapterIds: ["injective"] },
);
