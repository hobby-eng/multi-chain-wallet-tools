// The known answer of Tron message signing, TronWeb's signMessageV2 vector
// (test/testcases/src/sign-message.ts L4-L34 at 8719f745): the key 1 signs "hello world" for its
// T… address, and the same signature is refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { checkSignedAnswers, signingSelfTestKeyHex } from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

export function runTronMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Tron signMessageV2 message", [
    {
      key: signingSelfTestKeyHex(),
      request: {
        format: "tron-tip191",
        address: "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC",
        message: "hello world",
        network: "mainnet",
      },
      signature:
        "0x0dc0b53d525e0103a6013061cf18e60cf158809149f2b8994a545af65a7004cb1eeaff560e801ab51b28df5d42549aa024c2aa7e9d34de1e01294b9afb5e6c7e1c",
    },
  ]);
}
