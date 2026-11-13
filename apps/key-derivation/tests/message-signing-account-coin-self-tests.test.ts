import { describe, expect, it } from "vitest";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { COSMOS_MESSAGE_SIGNING } from "@ckd/coins/cosmos/message-signing.js";
import { INJECTIVE_MESSAGE_SIGNING } from "@ckd/coins/injective/message-signing.js";
import { HEDERA_MESSAGE_SIGNING } from "@ckd/coins/hedera/message-signing.js";
import { runCosmosMessageSigningSelfTest } from "../src/workers/message-signer-self-test-cosmos.js";
import { runInjectiveMessageSigningSelfTest } from "../src/workers/message-signer-self-test-injective.js";
import { runHederaMessageSigningSelfTest } from "../src/workers/message-signer-self-test-hedera.js";
import type { FeatureFunctions } from "../src/workers/worker-runtime.js";

const signers = new MessageSigners([
  COSMOS_MESSAGE_SIGNING,
  INJECTIVE_MESSAGE_SIGNING,
  HEDERA_MESSAGE_SIGNING,
]);
const features: FeatureFunctions = {
  signDerivedMessage: signers.sign,
  verifyDerivedMessage: signers.verify,
};
const CHECKS = [
  runCosmosMessageSigningSelfTest,
  runInjectiveMessageSigningSelfTest,
  runHederaMessageSigningSelfTest,
];

describe("the known answers of ADR-036, Injective's EIP-191 and HIP-820 message signing", () => {
  it.each(CHECKS)("pass through the composed signer and verifier: %o", async (check) => {
    expect((await check(features)).passed).toBe(true);
  });

  it.each(CHECKS)("fail when the signer answers otherwise: %o", async (check) => {
    const wrong: FeatureFunctions = {
      ...features,
      signDerivedMessage: async (...request) => ({
        ...(await signers.sign(...request)),
        signature: "A".repeat(86) + "==",
      }),
    };
    await expect(check(wrong)).rejects.toThrow(/signature/u);
  });

  it.each(CHECKS)("fail when the verifier accepts another message: %o", async (check) => {
    const lenient: FeatureFunctions = { ...features, verifyDerivedMessage: async () => true };
    await expect(check(lenient)).rejects.toThrow(/refusal of another message/u);
  });
});
