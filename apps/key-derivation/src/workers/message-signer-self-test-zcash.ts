// Known answers of Zcash message signing. No signature of a known key is published, so the startup
// answer is our own: the public key 1 signs the self-test message, computed with tmp
// check/a2_vectors.py, whose primitives first reproduce the published vectors of Litecoin Core,
// Bitcoin Core, Trezor, bitcoinjs-message, Electron Cash and Zallet. In the full self-test: Zallet's
// verify-only forum vector (zallet-core/src/components/json_rpc/methods/verify_message.rs
// L123-L127 at 73c8515b), and the startup signature under its uncompressed header 28, which Zallet
// refuses (L81-L90).
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import {
  checkSignedAnswers,
  checkVerifiedAnswers,
  signingSelfTestKeyHex,
  SIGNING_SELF_TEST_MESSAGE,
} from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

const request = (address: string, message = SIGNING_SELF_TEST_MESSAGE) =>
  ({ format: "zcash-compact", address, message, network: "mainnet" }) as const;
const KEY_ONE = "t1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs";

export function runZcashMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Zcash compact message", [
    {
      key: signingSelfTestKeyHex(),
      request: request(KEY_ONE),
      signature:
        "IOEH8KXORrLPsZDNWt0j5eFztRbE+ZaJMwhJgOuF2Hz1L/0T93WP/0WoOjoGZFHachu9FXzGCgvuELkCXx8xFWE=",
    },
  ]);
}

export function runZcashMessageSigningFullSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkVerifiedAnswers(features, "Zcash Zallet", [
    {
      request: request(
        "t1VydNnkjBzfL1iAMyUbwGKJAF7PgvuCfMY",
        "20251117: 1 Yay; 2 Yay; 3 Yay; 4 Yay; 5 Nay; 6 Nay; 7 Yay; 8 Yay; 9 Nay",
      ),
      signature:
        "H3RY+6ZfWUbzaaXxK8I42thf+f3tOrwKP2elphxAxq8tKypwJG4+V7EGR+sTWMZ5MFyvTQW8ZIV0yGU+93JTioA=",
      expected: true,
    },
    {
      request: request(KEY_ONE),
      signature:
        "HOEH8KXORrLPsZDNWt0j5eFztRbE+ZaJMwhJgOuF2Hz1L/0T93WP/0WoOjoGZFHachu9FXzGCgvuELkCXx8xFWE=",
      expected: "INVALID_HEADER",
    },
  ]);
}
