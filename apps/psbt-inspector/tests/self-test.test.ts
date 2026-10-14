import { describe, expect, it } from "vitest";
import { selectedSelfTests } from "../src/feature-selection.js";
import * as bitcoin from "../src/self-test-bitcoin.js";
import * as dash from "../src/self-test-dash.js";
import { expectSame } from "../src/self-test-checks.js";

describe("the Inspector's known-answer checks", () => {
  it("pass for every feature and both coins, at start and in the full self-test", async () => {
    const { startup, full } = selectedSelfTests();
    for (const check of [...startup, ...full]) await check.run();
    expect(startup.map((check) => check.name)).toContain("Bitcoin PSBT decoding (BIP174)");
    expect(startup.map((check) => check.name)).toContain("Dash PSBT decoding");
    expect(full.map((check) => check.name)).toEqual([
      "BIP-322 message verification vector",
      "BIP38 decryption vector",
      "Dash BIP38 decryption",
    ]);
  }, 60_000);

  it("include the descriptor check of a Dash-only build", () => {
    expect(() => dash.dashDescriptorDecoder.run()).not.toThrow();
    expect(() => bitcoin.bitcoinDescriptorDecoder.run()).not.toThrow();
  });

  it("fail, naming the check, when an answer differs", () => {
    expect(() => expectSame("BIP174 transaction id", "a", "b")).toThrow(
      "Self-test failed: BIP174 transaction id.",
    );
  });
});
