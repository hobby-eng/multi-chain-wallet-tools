import { ETHEREUM_CLASSIC_COIN_ADAPTERS } from "@ckd/coins/adapters/ethereum-classic.js";
import { ethereumClassicDerivation } from "@ckd/coins/ethereum-classic/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** Ethereum Classic's worker vectors, for every edition and selective build that has it. */
export const runEthereumClassicDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Ethereum Classic",
  adapters: ETHEREUM_CLASSIC_COIN_ADAPTERS,
  derivation: ethereumClassicDerivation,
  vectors: [
    {
      adapterId: "ethereum-classic",
      path: "m/44'/61'/0'/0/0",
      address: "0xFA22515E43658ce56A7682B801e9B5456f511420",
      accountXpub:
        "xpub6CqTNrUVV95XgHEP2LVe42cdpWKh2jeA4GnyXrQ219wJJVPAFajkbuFEdzf6xfGgdJWrhKuK5p8v47vxVQHFGU85J1J8Di95Z6hFJx8GhYz",
    },
  ],
});
