// The known answers of Solana message signing. No signature of a known key is published, so these
// are check/c_vectors.py's: RFC 8032's reference Ed25519, which first reproduces RFC 8032's TEST 1
// to 3 and SEP-53's vectors, signs with TEST 1's seed. At startup, the self-test message in both
// formats (version 0 of a printable ASCII message is format 0); in the full self-test, solana-sdk's
// layout vector "Тестовое сообщение", whose UTF-8 is format 1 and whose layout hash the script
// checks against solana-sdk's 6GXTve…. Each is also refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  ED25519_SELF_TEST_SEED,
  SIGNING_SELF_TEST_MESSAGE,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const request = (format: string, message: string) =>
  ({
    format,
    address: "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z",
    message,
    network: "mainnet",
  }) as const;

export function runSolanaMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Solana signMessage and off-chain message", [
    {
      key: ED25519_SELF_TEST_SEED,
      request: request("solana-raw", SIGNING_SELF_TEST_MESSAGE),
      signature:
        "Wv1YJpdMUAvAXis38EBgLfgUDxesyjepTJfeCRgV4cdUNgvLCAxEsyWqHsfLN4Tpv3dFjd4Y4KtXikxz7qwu1iz",
    },
    {
      key: ED25519_SELF_TEST_SEED,
      request: request("solana-offchain-v0", SIGNING_SELF_TEST_MESSAGE),
      signature:
        "2RY7h7a1eXLHWbJ2SKbTsvVkWVijTg7oWtwKDDP3wpfVx4BNAYXNEKPyd4EsFgs3FShzmL4w6hXNWpEsc5noHYSA",
    },
  ]);
}

export function runSolanaMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Solana off-chain message in UTF-8", [
    {
      key: ED25519_SELF_TEST_SEED,
      request: request("solana-offchain-v0", "Тестовое сообщение"),
      signature:
        "2EvuuGLDw2rZsa5e5PsLz11G33NtyPCVFABMpZ6JXGh6MrdQts5mLWytBJfkKNKGvLzXdmeLUTLfBfue8HV6ofKT",
    },
  ]);
}
