// The known answers of Injective message signing, one per format. ADR-036 with Keccak-256 has no
// published signature of a known key, so its answer is check/d_vectors.py's: vectors.py's RFC 6979
// with low S and Keccak-256, which first reproduce eth-account's and hedera-wallet-connect's
// signatures and verify Keplr's published juno signature, sign Keplr's sign document with the public
// test key 1. EIP-191's answer is eth-account's published "Some data" signature (tests/core/
// test_accounts.py L441-L496 at b659d043), for the inj1 form of its address. Each is also refused for
// another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  SIGNING_SELF_TEST_MESSAGE,
  signingSelfTestKeyHex,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

export function runInjectiveMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Injective ADR-036 and EIP-191 message", [
    {
      key: signingSelfTestKeyHex(),
      request: {
        format: "injective-adr036",
        address: "inj10e0525sfrf53yh2aljmm3sn9jq5njk7lwfmzjf",
        message: SIGNING_SELF_TEST_MESSAGE,
        network: "mainnet",
        inputs: { publicKey: "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" },
      },
      signature:
        '{"pub_key":{"type":"tendermint/PubKeySecp256k1","value":"Anm+Zn753LusVaBilc6HCwcCm/zbLc4o2VnygVsW+BeY"},"signature":"mjr1L6L8UoX57sP0XwOdByNR9FVheFiaay3vSFa2Ji5aTgfJNDP8r3V7S5/q6XciYcE5pok37lBoIhdCtF3Rzg=="}',
    },
    {
      key: "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
      request: {
        format: "injective-eip191",
        address: "inj1936ndcmqtkwpdfar67ccnrjjjwt2vhpr00nrtt",
        message: "Some data",
        network: "mainnet",
      },
      signature:
        "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c",
    },
  ]);
}
