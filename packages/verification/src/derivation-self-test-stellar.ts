import { STELLAR_COIN_ADAPTERS } from "@ckd/coins/adapters/stellar.js";
import { STELLAR_ADDRESSES, stellarDerivation } from "@ckd/coins/stellar/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// SEP-0005's test 5, the published accounts of this phrase.

/** Stellar's worker vectors, for every edition and selective build that has it. */
export const runStellarDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Stellar",
  adapters: STELLAR_COIN_ADAPTERS,
  derivation: stellarDerivation,
  addresses: STELLAR_ADDRESSES,
  vectors: [
    {
      adapterId: "stellar",
      path: "m/44'/148'/0'",
      address: "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
    },
  ],
});
