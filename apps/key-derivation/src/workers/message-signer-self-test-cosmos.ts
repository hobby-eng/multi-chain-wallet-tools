// The known answer of Cosmos Hub message signing. No ADR-036 signature of a known key is published
// (Keplr's tests use random keys; the ADR's own example does not verify), so the answer is
// check/d_vectors.py's: vectors.py's RFC 6979 with low S and SHA-256, which first reproduce Bitcoin
// Core's and hedera-wallet-connect's signatures and verify Keplr's published juno signature, sign
// Keplr's sign document with the public test key 1. It is also refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  SIGNING_SELF_TEST_MESSAGE,
  signingSelfTestKeyHex,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

/** The compressed public key of the key 1, which verification takes from the row. */
const PUBLIC_KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

export function runCosmosMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Cosmos ADR-036 message", [
    {
      key: signingSelfTestKeyHex(),
      request: {
        format: "cosmos-adr036",
        address: "cosmos1w508d6qejxtdg4y5r3zarvary0c5xw7k6ah60c",
        message: SIGNING_SELF_TEST_MESSAGE,
        network: "mainnet",
        inputs: { publicKey: PUBLIC_KEY },
      },
      signature:
        '{"pub_key":{"type":"tendermint/PubKeySecp256k1","value":"Anm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY"},"signature":"i6NTtxP/0eLjKzcpMkhcbGFjzfcZlllFV+12hrkFNoZaId/L3H5cwO6poxmpkDwYY0h818vE0CI1/crBcy+1+A=="}',
    },
  ]);
}
