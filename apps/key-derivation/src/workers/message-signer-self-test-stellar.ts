// The known answers of Stellar message signing, SEP-53's own (sep-0053.md L154-L187 at ced008c3,
// repeated in py-stellar-base's tests): its seed SAKICEVQ… signs "Hello, World!" at startup and
// "こんにちは、世界！" in the full self-test, for GBXFXNDL…; each is also refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { checkSignedAnswers } from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

/** SEP-53's seed SAKICEVQLYWGSOJS4WW7HZJWAHZVEEBS527LHK5V4MLJALYKICQCJXMW, in hex. */
const SEED = "148112b05e2c693932e5adf3e53601f3521032eebeb3abb5e316902f0a40a024";
const request = (message: string) =>
  ({
    format: "stellar-sep53",
    address: "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L",
    message,
    network: "mainnet",
  }) as const;

export function runStellarMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Stellar SEP-53 message", [
    {
      key: SEED,
      request: request("Hello, World!"),
      signature:
        "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==",
    },
  ]);
}

export function runStellarMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Stellar SEP-53 UTF-8 message", [
    {
      key: SEED,
      request: request("こんにちは、世界！"),
      signature:
        "CDU265Xs8y3OWbB/56H9jPgUss5G9A0qFuTqH2zs2YDgTm+++dIfmAEceFqB7bhfN3am59lCtDXrCtwH2k1GBA==",
    },
  ]);
}
