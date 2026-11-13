import { describe, expect, it } from "vitest";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { CARDANO_MESSAGE_SIGNING } from "@ckd/coins/cardano/message-signing.js";
import {
  runCardanoMessageSigningFullSelfTest,
  runCardanoMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-cardano.js";
import type { FeatureFunctions } from "../src/workers/worker-runtime.js";

const signers = new MessageSigners([CARDANO_MESSAGE_SIGNING]);
const features: FeatureFunctions = {
  signDerivedMessage: signers.sign,
  verifyDerivedMessage: signers.verify,
};

describe("the known answers of Cardano's CIP-30 signData", () => {
  it.each([runCardanoMessageSigningSelfTest, runCardanoMessageSigningFullSelfTest])(
    "pass through the composed signer and verifier: %o",
    async (check) => {
      expect((await check(features)).passed).toBe(true);
    },
  );

  it("fail when the signer answers otherwise", async () => {
    const wrong: FeatureFunctions = {
      ...features,
      signDerivedMessage: async (...request) => ({
        ...(await signers.sign(...request)),
        signature: "{}",
      }),
    };
    await expect(runCardanoMessageSigningSelfTest(wrong)).rejects.toThrow(/signature/u);
  });

  it("fail when the verifier accepts another message, or a changed or another key's signature", async () => {
    const lenient: FeatureFunctions = { ...features, verifyDerivedMessage: async () => true };
    await expect(runCardanoMessageSigningSelfTest(lenient)).rejects.toThrow(
      /refusal of another message/u,
    );
    await expect(runCardanoMessageSigningFullSelfTest(lenient)).rejects.toThrow(/vector/u);
  });

  it("fail when the verifier reads a non-canonical structure instead of refusing it", async () => {
    const guessing: FeatureFunctions = {
      ...features,
      verifyDerivedMessage: async (request, signature) => {
        try {
          return await signers.verify(request, signature);
        } catch {
          return false;
        }
      },
    };
    await expect(runCardanoMessageSigningFullSelfTest(guessing)).rejects.toThrow(/vector/u);
  });
});
