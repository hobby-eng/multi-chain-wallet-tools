// Known answers of Dogecoin message signing, from bitcoinjs-message's fixtures (test/fixtures.json
// L67-L131 at c43430f4): at startup, the signature of the key 1 for its compressed address; in the
// full self-test, the same r‖s under the uncompressed header for the uncompressed address, which
// this signer never writes (a verify-only vector; the address re-encoded with tmp
// check/a2_vectors.py).
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  checkVerifiedAnswers,
  signingSelfTestKeyHex,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const request = (address: string) =>
  ({
    format: "dogecoin-compact",
    address,
    message: "vires is numeris",
    network: "mainnet",
  }) as const;

export function runDogecoinMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Dogecoin compact message", [
    {
      key: signingSelfTestKeyHex(),
      request: request("DFpN6QqFfUm3gKNaxN6tNcab1FArL9cZLE"),
      signature:
        "H6k+dZwJ8oOei3PCSpdj603fDvhlhQ+sqaFNIDvo/bI+Xh6zyIKGzZpyud6YhZ1a5mcrwMVtTWL+VXq/hC5Zj7s=",
    },
  ]);
}

export function runDogecoinMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkVerifiedAnswers(features, "Dogecoin uncompressed", [
    {
      request: request("DJRU7MLhcPwCTNRZ4e8gJzDebtG1H5M7pc"),
      signature:
        "G6k+dZwJ8oOei3PCSpdj603fDvhlhQ+sqaFNIDvo/bI+Xh6zyIKGzZpyud6YhZ1a5mcrwMVtTWL+VXq/hC5Zj7s=",
      expected: true,
    },
  ]);
}
