import { DOGECOIN_COIN_ADAPTERS } from "@ckd/coins/adapters/dogecoin.js";
import { dogecoinDerivation } from "@ckd/coins/dogecoin/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).
// Dogecoin serializes its extended keys as dgub/dgpv: its master and account dgub come from
// test/oracles/bip32_oracle.py, an independent reimplementation that first reproduces BIP86's
// master xpub of this phrase.

/** Dogecoin's worker vectors, for every edition and selective build that has it. */
export const runDogecoinDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Dogecoin",
  adapters: DOGECOIN_COIN_ADAPTERS,
  derivation: dogecoinDerivation,
  vectors: [
    {
      adapterId: "dogecoin",
      path: "m/44'/3'/0'/0/0",
      address: "DBus3bamQjgJULBJtYXpEzDWQRwF5iwxgC",
      accountXpub:
        "dgub8rUhDtD3YFGZTUphBfpBbzvFxSMKQXYLzg87Me2ta78r2SdVLmypBUkkxrrn9RTnchsyiJSkHZyLWxD13ibBiXtuFWktBoDaGaZjQUBLNLs",
      masterXpub:
        "dgub8kXBZ7ymNWy2RzFfCuAkHMfuUEjbxDK33snqz5r7YTvUsExaHDbWWdju6FedaPkBTDmwMqtGHL8NhLDczSVBKMdpJHR6KrcTDQdnwPMrQZU",
    },
  ],
});
