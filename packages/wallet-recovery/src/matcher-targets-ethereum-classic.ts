import { EthereumAddress } from "@ckd/core/eip55.js";
import { singleKeyMatcher } from "./matcher-targets-single-key.js";

/** Ethereum Classic's part of the matcher: a 0x address, which Ethereum's part may read too. */
export const ETHEREUM_CLASSIC_MATCHER = singleKeyMatcher(["ethereum-classic"], (value) =>
  EthereumAddress.accepts(value)
    ? { normalized: value.toLowerCase(), adapterIds: ["ethereum-classic"] }
    : null,
);
