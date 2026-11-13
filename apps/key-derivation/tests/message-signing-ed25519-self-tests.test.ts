import { describe, expect, it } from "vitest";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { SOLANA_MESSAGE_SIGNING } from "@ckd/coins/solana/message-signing.js";
import { STELLAR_MESSAGE_SIGNING } from "@ckd/coins/stellar/message-signing.js";
import { NEAR_MESSAGE_SIGNING } from "@ckd/coins/near/message-signing.js";
import { TON_MESSAGE_SIGNING } from "@ckd/coins/ton/message-signing.js";
import {
  runSolanaMessageSigningFullSelfTest,
  runSolanaMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-solana.js";
import {
  runStellarMessageSigningFullSelfTest,
  runStellarMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-stellar.js";
import {
  runNearMessageSigningFullSelfTest,
  runNearMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-near.js";
import {
  runTonMessageSigningFullSelfTest,
  runTonMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-ton.js";
import type { FeatureFunctions } from "../src/workers/worker-runtime.js";

const signers = new MessageSigners([
  SOLANA_MESSAGE_SIGNING,
  STELLAR_MESSAGE_SIGNING,
  NEAR_MESSAGE_SIGNING,
  TON_MESSAGE_SIGNING,
]);
const features: FeatureFunctions = {
  signDerivedMessage: signers.sign,
  verifyDerivedMessage: signers.verify,
};
/** The checks that sign a known answer, at startup and in the full self-test. */
const SIGNED = [
  runSolanaMessageSigningSelfTest,
  runSolanaMessageSigningFullSelfTest,
  runStellarMessageSigningSelfTest,
  runStellarMessageSigningFullSelfTest,
  runNearMessageSigningSelfTest,
  runTonMessageSigningSelfTest,
];
/** The full self-test's published signatures, which are verified only. */
const VERIFIED = [runNearMessageSigningFullSelfTest, runTonMessageSigningFullSelfTest];

describe("the known answers of Ed25519 message signing", () => {
  it.each([...SIGNED, ...VERIFIED])(
    "pass through the composed signer and verifier: %o",
    async (check) => {
      expect((await check(features)).passed).toBe(true);
    },
  );

  it.each(SIGNED)("fail when the signer answers otherwise: %o", async (check) => {
    const wrong: FeatureFunctions = {
      ...features,
      signDerivedMessage: async (...request) => ({
        ...(await signers.sign(...request)),
        signature: "1".repeat(64),
      }),
    };
    await expect(check(wrong)).rejects.toThrow(/signature/u);
  });

  it.each([...SIGNED, ...VERIFIED])(
    "fail when the verifier accepts another message: %o",
    async (check) => {
      const lenient: FeatureFunctions = { ...features, verifyDerivedMessage: async () => true };
      await expect(check(lenient)).rejects.toThrow(/refusal/u);
    },
  );

  it.each(VERIFIED)("fail when the verifier refuses a published signature: %o", async (check) => {
    const strict: FeatureFunctions = { ...features, verifyDerivedMessage: async () => false };
    await expect(check(strict)).rejects.toThrow(/vector/u);
  });
});
