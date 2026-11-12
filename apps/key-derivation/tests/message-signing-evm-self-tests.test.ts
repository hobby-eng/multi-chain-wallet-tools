import { describe, expect, it } from "vitest";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { ETHEREUM_MESSAGE_SIGNING } from "@ckd/coins/ethereum/message-signing.js";
import { ETHEREUM_CLASSIC_MESSAGE_SIGNING } from "@ckd/coins/ethereum-classic/message-signing.js";
import { TRON_MESSAGE_SIGNING } from "@ckd/coins/tron/message-signing.js";
import {
  runEthereumMessageSigningFullSelfTest,
  runEthereumMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-ethereum.js";
import {
  runEthereumClassicMessageSigningFullSelfTest,
  runEthereumClassicMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-ethereum-classic.js";
import { runTronMessageSigningSelfTest } from "../src/workers/message-signer-self-test-tron.js";
import type { FeatureFunctions } from "../src/workers/worker-runtime.js";

const signers = new MessageSigners([
  ETHEREUM_MESSAGE_SIGNING,
  ETHEREUM_CLASSIC_MESSAGE_SIGNING,
  TRON_MESSAGE_SIGNING,
]);
const features: FeatureFunctions = {
  signDerivedMessage: signers.sign,
  verifyDerivedMessage: signers.verify,
};
const CHECKS = [
  runEthereumMessageSigningSelfTest,
  runEthereumMessageSigningFullSelfTest,
  runEthereumClassicMessageSigningSelfTest,
  runEthereumClassicMessageSigningFullSelfTest,
  runTronMessageSigningSelfTest,
];

describe("the known answers of EIP-191 and TIP-191 message signing", () => {
  it.each(CHECKS)("pass through the composed signer and verifier: %o", async (check) => {
    expect((await check(features)).passed).toBe(true);
  });

  it.each(CHECKS)("fail when the signer answers otherwise: %o", async (check) => {
    const wrong: FeatureFunctions = {
      ...features,
      signDerivedMessage: async (...request) => ({
        ...(await signers.sign(...request)),
        signature: `0x${"00".repeat(64)}1b`,
      }),
    };
    await expect(check(wrong)).rejects.toThrow(/signature/u);
  });

  it.each(CHECKS)("fail when the verifier accepts another message: %o", async (check) => {
    const lenient: FeatureFunctions = { ...features, verifyDerivedMessage: async () => true };
    await expect(check(lenient)).rejects.toThrow(/refusal of another message/u);
  });
});
