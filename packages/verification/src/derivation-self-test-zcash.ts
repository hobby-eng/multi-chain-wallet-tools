import { ZCASH_COIN_ADAPTERS } from "@ckd/coins/adapters/zcash.js";
import { zcashDerivation } from "@ckd/coins/zcash/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** Zcash's worker vectors, for every edition and selective build that has it. */
export const runZcashDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Zcash",
  adapters: ZCASH_COIN_ADAPTERS,
  derivation: zcashDerivation,
  vectors: [
    {
      adapterId: "zcash",
      path: "m/44'/133'/0'/0/0",
      address: "t1XVXWCvpMgBvUaed4XDqWtgQgJSu1Ghz7F",
      accountXpub:
        "xpub6CLX6bXDznyoBCRaHYmzfApq4dLc34UydL1gRHQTG55pNwbKSC2GvXjTQ4VS3n6P24fRd14uKz7P92xJQ3MWdRzUxGkqiftZf3riboiJLJs",
    },
  ],
});
