// The self-test of the twelve coins (core/coins.ts) as "coin-address" wallet evidence: the checks
// of every coin family (the -self-test.ts modules of core/coins/) as one row. A host that builds in every coin
// adds it to its self-test (SelfTestHost.features, MnemoCodeSelfTest.core); a host of one family,
// such as the Dash edition of the Deriver, takes that family's check instead, such as
// DASH_ADDRESS_SELF_TEST of core/coins/dash-self-test.ts, and carries none of the others.
//
// Host-neutral: it imports only the coin families' self-test modules.

import { BITCOIN_CASH_ADDRESS_SELF_TEST } from "./coins/bitcoin-cash-self-test.js";
import { BITCOIN_LIKE_ADDRESS_SELF_TEST } from "./coins/bitcoin-like-self-test.js";
import { COSMOS_ADDRESS_SELF_TEST } from "./coins/cosmos-self-test.js";
import { DASH_ADDRESS_SELF_TEST } from "./coins/dash-self-test.js";
import { EVM_ADDRESS_SELF_TEST } from "./coins/evm-self-test.js";
import { XRP_ADDRESS_SELF_TEST } from "./coins/xrp-self-test.js";
import { combinedFeature, type SelfTestFeature } from "./self-test-check.js";

/** Every family's checks, in the order of core/coins.ts's list. */
const FAMILIES: readonly SelfTestFeature[] = [
  BITCOIN_LIKE_ADDRESS_SELF_TEST,
  BITCOIN_CASH_ADDRESS_SELF_TEST,
  COSMOS_ADDRESS_SELF_TEST,
  DASH_ADDRESS_SELF_TEST,
  EVM_ADDRESS_SELF_TEST,
  XRP_ADDRESS_SELF_TEST,
];

/** The checks of every coin's addresses, as one row, for a host that builds them all in. */
export const COIN_ADDRESS_SELF_TEST: SelfTestFeature = combinedFeature(
  "Coin addresses",
  "every family of the twelve coins: their addresses, other places, scans, refusals",
  FAMILIES,
);
