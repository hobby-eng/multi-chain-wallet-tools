import { COSMOS_COIN_ADAPTERS } from "@ckd/coins/adapters/cosmos.js";
import { cosmosDerivation } from "@ckd/coins/cosmos/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** Cosmos's worker vectors, for every edition and selective build that has it. */
export const runCosmosDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Cosmos",
  adapters: COSMOS_COIN_ADAPTERS,
  derivation: cosmosDerivation,
  vectors: [
    {
      adapterId: "cosmos",
      path: "m/44'/118'/0'/0/0",
      address: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
      accountXpub:
        "xpub6DGzViq8bmgMLYdVZ3xnLVEdKwzBnGdzzJZ4suG8kVb9TTLAbrwv8YdKBb8FWKdBNinaHKmBv7JpQvqBYx4rxch7WnHzNFzSVrMf8hQepTP",
    },
  ],
});
