// Injective's account states from a REST gateway (cosmos-sdk.ts): inj1… accounts and the bank
// balance of inj, the denomination of 10^-18 INJ. Injective's accounts are Ethereum's account
// bytes, so an EVM address (0x…) names the same account as its inj1… form.
import { bech32 } from "@scure/base";
import { hexToBytes } from "@ckd/core/crypto.js";
import { EthereumAddress } from "@ckd/core/eip55.js";
import { INJECTIVE_HRP } from "@ckd/coins/injective/profiles.js";
import { cosmosSdkProvider } from "./cosmos-sdk.js";

/** Injective's provider (api "injective-rest"). */
export const INJECTIVE_REST_PROVIDER = cosmosSdkProvider({
  prefix: INJECTIVE_HRP,
  denom: "inj",
  addressForm: "inj1… or 0x…",
  // Injective's first key of the public phrase (m/44'/60'/0'/0/0) as its EVM address, the inj1…
  // account it names, and that account with its last character changed.
  addressVectors: {
    name: "Injective bech32 and EVM address forms",
    typed: "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
    canonical: "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dz",
    refused: "inj1npvwllfr9dqr8erajqqr6s0vxnk2ak55re90dy",
  },
  // An EVM address in one letter case or with a valid EIP-55 checksum.
  account: (value) =>
    EthereumAddress.accepts(value)
      ? bech32.encodeFromBytes(INJECTIVE_HRP, hexToBytes(value.slice(2).toLowerCase()))
      : null,
});
