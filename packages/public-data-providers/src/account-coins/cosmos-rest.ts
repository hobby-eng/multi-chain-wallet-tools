// The Cosmos Hub's account states from a REST gateway (cosmos-sdk.ts): cosmos1… accounts and the
// bank balance of uatom, the micro-ATOM denomination.
import { COSMOS_HRP } from "@ckd/coins/cosmos/profiles.js";
import { cosmosSdkProvider } from "./cosmos-sdk.js";

/** The Cosmos Hub's provider (api "cosmos-rest"). */
export const COSMOS_REST_PROVIDER = cosmosSdkProvider({
  prefix: COSMOS_HRP,
  denom: "uatom",
  addressForm: "cosmos1…",
  // The Cosmos Hub's first address of the public phrase (m/44'/118'/0'/0/0) typed in upper case,
  // which bech32 allows, and the same address with its last character changed.
  addressVectors: {
    name: "Cosmos bech32 address checksum",
    typed: "COSMOS19RL4CM2HMR8AFY4KLDPXZ3FKA4JGUQ0AUQDAL4",
    canonical: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4",
    refused: "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal5",
  },
});
