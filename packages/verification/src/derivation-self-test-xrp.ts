import { XRP_COIN_ADAPTERS } from "@ckd/coins/adapters/xrp.js";
import { XRP_ADDRESSES, xrpDerivation } from "@ckd/coins/xrp/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** XRP's worker vectors, for every edition and selective build that has it. */
export const runXrpDerivationSelfTest = singleKeyCoinSelfTest({
  group: "XRP",
  adapters: XRP_COIN_ADAPTERS,
  derivation: xrpDerivation,
  addresses: XRP_ADDRESSES,
  vectors: [
    {
      adapterId: "xrp",
      path: "m/44'/144'/0'/0/0",
      address: "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3",
      accountXpub:
        "xpub6CFKyZTfzj3cyeRLUDKwQQ5s1tqTTdVgywKMVkrB2i1taGFbhazkxDzWVsfBHZpv7rg6qpDBGYR5oA8iazEfa44CdQkkknPFHJ7YCzncCS9",
    },
  ],
});
