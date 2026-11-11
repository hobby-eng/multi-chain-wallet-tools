import { INJECTIVE_COIN_ADAPTERS } from "@ckd/coins/adapters/injective.js";
import { INJECTIVE_ADDRESSES, injectiveDerivation } from "@ckd/coins/injective/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).
// The account key is Ethereum's m/44'/60'/0', since Injective shares its coin type.

/** Injective's worker vectors, for every edition and selective build that has it. */
export const runInjectiveDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Injective",
  adapters: INJECTIVE_COIN_ADAPTERS,
  derivation: injectiveDerivation,
  addresses: INJECTIVE_ADDRESSES,
  vectors: [
    {
      adapterId: "injective",
      path: "m/44'/60'/0'/0/0",
      address: "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
      accountXpub:
        "xpub6DCoCpSuQZB2jawqnGMEPS63ePKWkwWPH4TU45Q7LPXWuNd8TMtVxRrgjtEshuqpK3mdhaWHPFsBngh5GFZaM6si3yZdUsT8ddYM3PwnATt",
    },
  ],
});
