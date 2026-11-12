import { describe, expect, it } from "vitest";
import { MessageSigners } from "@ckd/coins/message-signing.js";
import { BITCOIN_CASH_MESSAGE_SIGNING } from "@ckd/coins/bitcoin-cash/message-signing.js";
import { DOGECOIN_MESSAGE_SIGNING } from "@ckd/coins/dogecoin/message-signing.js";
import { LITECOIN_MESSAGE_SIGNING } from "@ckd/coins/litecoin/message-signing.js";
import { ZCASH_MESSAGE_SIGNING } from "@ckd/coins/zcash/message-signing.js";
import {
  runBitcoinCashMessageSigningFullSelfTest,
  runBitcoinCashMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-bitcoin-cash.js";
import {
  runDogecoinMessageSigningFullSelfTest,
  runDogecoinMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-dogecoin.js";
import {
  runLitecoinMessageSigningFullSelfTest,
  runLitecoinMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-litecoin.js";
import {
  runZcashMessageSigningFullSelfTest,
  runZcashMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-zcash.js";
import type { FeatureFunctions } from "../src/workers/worker-runtime.js";

const signers = new MessageSigners([
  LITECOIN_MESSAGE_SIGNING,
  DOGECOIN_MESSAGE_SIGNING,
  BITCOIN_CASH_MESSAGE_SIGNING,
  ZCASH_MESSAGE_SIGNING,
]);
const features: FeatureFunctions = {
  signDerivedMessage: signers.sign,
  verifyDerivedMessage: signers.verify,
};

const COINS = [
  ["Litecoin", runLitecoinMessageSigningSelfTest, runLitecoinMessageSigningFullSelfTest],
  ["Dogecoin", runDogecoinMessageSigningSelfTest, runDogecoinMessageSigningFullSelfTest],
  ["Bitcoin Cash", runBitcoinCashMessageSigningSelfTest, runBitcoinCashMessageSigningFullSelfTest],
  ["Zcash", runZcashMessageSigningSelfTest, runZcashMessageSigningFullSelfTest],
] as const;

describe("the known answers of the compact coins' message signing", () => {
  it.each(COINS)(
    "pass for %s at startup and in the full self-test",
    async (name, startup, full) => {
      expect((await startup(features)).checks).toEqual([`${name} compact message signature`]);
      expect((await full(features)).passed).toBe(true);
    },
  );

  it.each(COINS)("fail for %s when the composed signer answers otherwise", async (_n, startup) => {
    const wrong: FeatureFunctions = {
      ...features,
      signDerivedMessage: async (...request) => ({
        ...(await signers.sign(...request)),
        signature: "H".padEnd(88, "A"),
      }),
    };
    await expect(startup(wrong)).rejects.toThrow(/compact message signature/u);
  });

  it.each(COINS)("fail for %s when the verifier accepts everything", async (_n, startup, full) => {
    const lenient: FeatureFunctions = { ...features, verifyDerivedMessage: async () => true };
    await expect(startup(lenient)).rejects.toThrow(/refusal of another message/u);
    await expect(full(lenient)).rejects.toThrow(/vector/u);
  });
});
