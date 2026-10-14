import { describe, expect, it } from "vitest";
import { runBitcoinBip38FullSelfTest } from "../src/workers/bip38-self-test-bitcoin.js";
import { runDashBip38FullSelfTest } from "../src/workers/bip38-self-test-dash.js";
import { encryptDerivedP2pkhKey } from "../src/workers/bip38-encrypter.js";
import { encryptDerivedP2pkhKey as encryptDashP2pkhKey } from "../src/workers/bip38-encrypter-dash.js";
import { runBip85SelfTest } from "../src/workers/bip85-self-test.js";
import {
  runBip322FullSelfTest,
  runBitcoinMessageSigningSelfTest,
} from "../src/workers/message-signer-self-test-bitcoin.js";
import { runDashMessageSigningSelfTest } from "../src/workers/message-signer-self-test-dash.js";
import { signDerivedMessage } from "../src/workers/message-signer.js";
import { signDerivedMessage as signDashMessage } from "../src/workers/message-signer-dash.js";
import { runSilentPaymentSelfTest } from "../src/workers/silent-payment-self-test.js";
import type { FeatureFunctions } from "../src/workers/worker-runtime.js";

/** The functions a build with Bitcoin composes, and those of a build with Dash alone. */
const multiCoin: FeatureFunctions = { signDerivedMessage, encryptDerivedP2pkhKey };
const dashOnly: FeatureFunctions = {
  signDerivedMessage: signDashMessage,
  encryptDerivedP2pkhKey: encryptDashP2pkhKey,
};

describe("the known answers of the Deriver's optional features", () => {
  it("pass at startup: BIP85, Silent Payments and each coin's compact message signature", async () => {
    expect(runBip85SelfTest().checks).toEqual(["BIP85 BIP39 / WIF / XPRV / HEX"]);
    expect((await runSilentPaymentSelfTest()).checks).toEqual(["Silent Payments / BIP352"]);
    expect((await runBitcoinMessageSigningSelfTest(multiCoin)).checks).toEqual([
      "Bitcoin compact message signature",
    ]);
    // A build with both coins checks Dash through its own signer, the one its worker uses.
    for (const features of [multiCoin, dashOnly])
      expect((await runDashMessageSigningSelfTest(features)).checks).toEqual([
        "Dash compact message signature",
      ]);
  });

  it("pass in the full self-test: BIP-322 and each coin's BIP38", async () => {
    expect((await runBip322FullSelfTest(multiCoin)).checks).toEqual([
      "BIP-322 simple signature vector",
    ]);
    expect((await runBitcoinBip38FullSelfTest(multiCoin)).checks).toEqual([
      "BIP38 Bitcoin encryption vector",
    ]);
    for (const features of [multiCoin, dashOnly])
      expect((await runDashBip38FullSelfTest(features)).checks).toEqual([
        "BIP38 Dash encryption vector",
      ]);
  }, 60_000);

  it("fail when the composed function gives another answer, or is missing", async () => {
    const wrongSigner: FeatureFunctions = {
      signDerivedMessage: async (...request) => ({
        ...(await signDerivedMessage(...request)),
        signature: "H".padEnd(88, "A"),
      }),
    };
    await expect(runBitcoinMessageSigningSelfTest(wrongSigner)).rejects.toThrow(
      /Bitcoin compact message signature/u,
    );
    await expect(runDashMessageSigningSelfTest({})).rejects.toThrow(/not composed/u);
    await expect(runDashBip38FullSelfTest({})).rejects.toThrow(/not composed/u);
  });
});
