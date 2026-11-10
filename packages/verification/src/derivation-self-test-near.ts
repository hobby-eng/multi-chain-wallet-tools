import { NEAR_COIN_ADAPTERS } from "@ckd/coins/adapters/near.js";
import { nearDerivation } from "@ckd/coins/near/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// From test/oracles/ed25519_oracle.py, which first reproduces near-seed-phrase's published vector.

/** NEAR's worker vectors, for every edition and selective build that has it. */
export const runNearDerivationSelfTest = singleKeyCoinSelfTest({
  group: "NEAR",
  adapters: NEAR_COIN_ADAPTERS,
  derivation: nearDerivation,
  vectors: [
    {
      adapterId: "near",
      path: "m/44'/397'/0'",
      address: "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412",
    },
  ],
});
