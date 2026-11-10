import { SOLANA_COIN_ADAPTERS } from "@ckd/coins/adapters/solana.js";
import { SOLANA_ADDRESSES, solanaDerivation } from "@ckd/coins/solana/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// Solana publishes no phrase vector: these come from test/oracles/ed25519_oracle.py, an independent
// reimplementation that first reproduces SEP-0005's, near-seed-phrase's and the Hiero SDK's vectors.

/** Solana's worker vectors, for every edition and selective build that has it. */
export const runSolanaDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Solana",
  adapters: SOLANA_COIN_ADAPTERS,
  derivation: solanaDerivation,
  addresses: SOLANA_ADDRESSES,
  vectors: [
    {
      adapterId: "solana",
      path: "m/44'/501'/0'/0'",
      address: "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
    },
    {
      adapterId: "solana-ledger",
      path: "m/44'/501'/0'",
      address: "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL",
    },
  ],
});
