import { HEDERA_COIN_ADAPTERS } from "@ckd/coins/adapters/hedera.js";
import { HEDERA_ADDRESSES, hederaDerivation } from "@ckd/coins/hedera/index.js";
import { singleKeyCoinSelfTest } from "./single-key-coin-self-test.js";

// The Ed25519 key comes from test/oracles/ed25519_oracle.py, which first reproduces the Hiero
// (Hedera) SDK's published vectors. The ECDSA key's derivation reproduces the SDK's
// toStandardECDSAsecp256k1PrivateKey vector (packages/coin-protocols/tests/ed25519-coins.test.ts),
// its account key is recomputed by test/oracles/bip32_oracle.py, and its EVM address is Ethereum's
// encoding of that key.

/** Hedera's worker vectors, for every edition and selective build that has it. */
export const runHederaDerivationSelfTest = singleKeyCoinSelfTest({
  group: "Hedera",
  adapters: HEDERA_COIN_ADAPTERS,
  derivation: hederaDerivation,
  addresses: HEDERA_ADDRESSES,
  vectors: [
    {
      adapterId: "hedera",
      path: "m/44'/3030'/0'/0'/0'",
      address:
        "0.0.302a300506032b657003210010fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf",
    },
    {
      adapterId: "hedera-ecdsa",
      path: "m/44'/3030'/0'/0/0",
      address: "0xC283f34aDafdB758a557304C5F5e4c1E0A554713",
      // The connected tools look the key up by its alias, the row's public key in DER.
      publicLookup:
        "0.0.302d300706052b8104000a032200021de0d6f31872bbda0cfd1680e41a5a88af2646b8d1d015c5e1541ab21a0f4499",
      accountXpub:
        "xpub6CX2E9DvXXF9J6g7wRAvFR46xWpN7zwH1zT7BsuCbAf8TWWfhHiWTdakYTCeyuzNEig4kSL7jEnJjCXmCG4ez9Lum9iLW1shdpAvfGLMeAK",
    },
  ],
});
