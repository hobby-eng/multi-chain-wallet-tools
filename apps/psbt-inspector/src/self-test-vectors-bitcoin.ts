// Public literals from BIP86's first receiving output and BIP173/BIP350's
// compressed generator-key witness address. No HD derivation is needed here.
export const BITCOIN_ADDRESS_VECTORS = {
  taproot: {
    address: "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr",
    script: "5120a60869f0dbcf1dc659c9cecbaf8050135ea9e8cdc487053f1dc6880949dc684c",
  },
  witnessV0: {
    address: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
    script: "0014751e76e8199196d454941c45d1b3a323f1433bd6",
  },
} as const;
