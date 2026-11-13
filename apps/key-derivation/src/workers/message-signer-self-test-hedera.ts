// The known answers of Hedera message signing, hedera-wallet-connect's published hedera_signMessage
// vectors (test/wallet/methods/wallet-signMessage.test.ts L32-L44 at 9798423c, keys from
// test/_helpers.ts L111-L115): "Hello Future" signed by its Ed25519 key for that key's alias, and by
// its ECDSA key for that key's EVM address, each as the published SignatureMap; check/d_vectors.py
// gives the row addresses. Each is also refused for another message.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { checkSignedAnswers } from "./message-signer-self-test.js";
import type { FeatureFunctions } from "./worker-runtime.js";

export function runHederaMessageSigningSelfTest(
  features: FeatureFunctions,
): Promise<CryptoSelfTestReport> {
  return checkSignedAnswers(features, "Hedera HIP-820 message", [
    {
      key: "133eefea772add1f995c96bccf42b08b76daf67665f0c4c5ae308fae9275c142",
      request: {
        format: "hedera-hip820-ed25519",
        address:
          "0.0.302a300506032b6570032100a2ef13761b644a651a1a4ac666eafbac419c97282f8af5c33f58d732e73e5a55",
        message: "Hello Future",
        network: "mainnet",
      },
      signature:
        "CmQKIKLvE3YbZEplGhpKxmbq+6xBnJcoL4r1wz9Y1zLnPlpVGkBtfDTfBZGf/MUbovYyLUjORErDGhDYbzPFoAbkMwRrpw2ouDRmn6Dd6A06k6yM/FhZ/VjdHVhQUd+fxv1cZqUM",
    },
    {
      key: "3ce31ffad30d6db47c315bbea08232aad2266d8800a12aa3d8a812486e782759",
      request: {
        format: "hedera-hip820-ecdsa",
        address: "0xcAE54ce22E3b27062a1729f49Dea2BB12CEE259e",
        message: "Hello Future",
        network: "mainnet",
        inputs: { publicKey: "0278279df21ae3cd30610627b1e423ebb7405c54b8039af552c4b458fb63aa8d33" },
      },
      signature:
        "CmUKIQJ4J53yGuPNMGEGJ7HkI+u3QFxUuAOa9VLEtFj7Y6qNMzJAp3vxT7kRPE9HFFm/bbArGYDQ+psNWZC70rdW2bE1L85u79GOlQSTlaog5lmE6TiaX6r8Bk70dU7ZIwcHgnAkCw==",
    },
  ]);
}
