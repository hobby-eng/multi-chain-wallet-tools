// The known answers of NEAR message signing. No NEP-413 signature of a known key is published, so
// the startup answer is check/c_vectors.py's: RFC 8032's reference Ed25519, which first reproduces
// RFC 8032's TEST 1 to 3 and verifies near/intents' vector, signs with TEST 1's seed for the
// recipient self-test.example and a nonce of 32 zero bytes. The full self-test verifies
// near/intents' signature (crates/signatures/nep413/src/lib.rs L143-L152 at fce0936b). Each valid
// signature is also refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  checkVerifiedAnswers,
  ED25519_SELF_TEST_SEED,
  SIGNING_SELF_TEST_MESSAGE,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const ZERO_NONCE = "00".repeat(32);

export function runNearMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "NEAR NEP-413 message", [
    {
      key: ED25519_SELF_TEST_SEED,
      request: {
        format: "near-nep413",
        address: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
        message: SIGNING_SELF_TEST_MESSAGE,
        network: "mainnet",
        inputs: { recipient: "self-test.example", nonce: ZERO_NONCE },
      },
      signature:
        '{"accountId":"d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a","publicKey":"ed25519:FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z","signature":"UoLrTUKMBCy0D/IndFD6W9gOPba3dgJATnIoA3NrK+hCE2LyAmJyVHnEfxUxUgxtPvn7i3RmvuYFJThM1HNECw=="}',
    },
  ]);
}

export function runNearMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkVerifiedAnswers(features, "NEAR NEP-413 near/intents", [
    {
      request: {
        format: "near-nep413",
        address: "e2e9cb7ac57cb46d4da1ce1d1cc2c33bdfe17407c517916b522724a8ea2c6c50",
        message: "Hello, world!",
        network: "mainnet",
        inputs: { recipient: "intents.near", nonce: ZERO_NONCE },
      },
      signature:
        "4v9iVIcaP+wYU8FntC8PFCSMTPf+9UUtwk2NvcXEvxg6twcyK014LV9aBVcbrkdsX37kHEc/MALmAIZeRrddDw==",
      expected: true,
    },
  ]);
}
