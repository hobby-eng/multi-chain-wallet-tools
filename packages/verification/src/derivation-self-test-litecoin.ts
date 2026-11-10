import { LITECOIN_COIN_ADAPTERS } from "@ckd/coins/adapters/litecoin.js";
import { litecoinDerivation } from "@ckd/coins/litecoin/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The first addresses of the public phrase, which MnemoCode's own Rust derivation finds at the same
// paths, and the account keys, which test/oracles/bip32_oracle.py recomputes independently
// (packages/coin-protocols/tests/bip44-coins.test.ts).

/** Litecoin's worker vectors, for every edition and selective build that has it. */
export const runLitecoinDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Litecoin",
  adapters: LITECOIN_COIN_ADAPTERS,
  derivation: litecoinDerivation,
  vectors: [
    {
      adapterId: "litecoin-legacy",
      path: "m/44'/2'/0'/0/0",
      address: "LUWPbpM43E2p7ZSh8cyTBEkvpHmr3cB8Ez",
      accountXpub:
        "xpub6BnJJjq783EdyBeQPA9P9ao9DTS3fUqyKG5NJDcrCiwwxEkesGoHN94LZRGE7rz1jgcvmmp8j55BNx573KFq1WBwKiemzkdfNKffKx6Mvku",
    },
    {
      adapterId: "litecoin-nested-segwit",
      path: "m/49'/2'/0'/0/0",
      address: "M7wtsL7wSHDBJVMWWhtQfTMSYYkyooAAXM",
    },
    {
      adapterId: "litecoin-native-segwit",
      path: "m/84'/2'/0'/0/0",
      address: "ltc1qjmxnz78nmc8nq77wuxh25n2es7rzm5c2rkk4wh",
    },
  ],
});
