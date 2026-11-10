import { TRON_COIN_ADAPTERS } from "@ckd/coins/adapters/tron.js";
import { TRON_ADDRESSES, tronDerivation } from "@ckd/coins/tron/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** Tron's worker vectors, for every edition and selective build that has it. */
export const runTronDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Tron",
  adapters: TRON_COIN_ADAPTERS,
  derivation: tronDerivation,
  addresses: TRON_ADDRESSES,
  vectors: [
    {
      adapterId: "tron",
      path: "m/44'/195'/0'/0/0",
      address: "TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH",
      accountXpub:
        "xpub6D1AabNHCupeiLM65ZR9UStMhJ1vCpyV4XbZdyhMZBiJXALQtmn9p42VTQckoHVn8WNqS7dqnJokZHAHcHGoaQgmv8D45oNUKx6DZMNZBCd",
    },
  ],
});
