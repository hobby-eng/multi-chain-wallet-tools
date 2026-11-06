import { describe, expect, it, vi } from "vitest";
import { signBip322Message, verifyBip322Message } from "../src/workers/bip322-signer.js";
import { signDerivedMessage } from "../src/workers/message-signer.js";

const startupFailure = vi.hoisted(() => new Error("Synthetic external WASM initialization fault"));
vi.mock("btcutil-js", () => ({
  init: () => {
    throw startupFailure;
  },
}));

// Public generator key; these refusal cases must finish before the external WASM starts.
const key = "1".padStart(64, "0");
const publicInput = [key, "public address", "public message", "mainnet", "native-segwit", "00"];

describe("message signing refuses invalid requests before initializing its backend", () => {
  it.each([
    { index: 0, value: "11", code: "INVALID_KEY" },
    { index: 2, value: "", code: "EMPTY_MESSAGE" },
    { index: 3, value: "unknown network", code: "INVALID_NETWORK" },
    { index: 4, value: "unknown mode", code: "INVALID_MODE" },
    { index: 5, value: "not hex", code: "INVALID_SCRIPT" },
  ])("refuses $code without using external WASM", async ({ index, value, code }) => {
    const request = [...publicInput];
    request[index] = value;
    await expect(Reflect.apply(signBip322Message, undefined, request)).rejects.toMatchObject({
      code,
    });
  });

  it("refuses an unknown composed signing format instead of treating it as Taproot", async () => {
    await expect(
      Reflect.apply(signDerivedMessage, undefined, [
        key,
        "public address",
        "public message",
        "mainnet",
        "unknown format",
        [],
      ]),
    ).rejects.toMatchObject({ code: "INVALID_FORMAT" });
  });

  it("keeps an external verifier startup failure distinct from an invalid signature", async () => {
    await expect(
      verifyBip322Message("public message", "public address", "public signature", "mainnet"),
    ).rejects.toMatchObject({
      code: "VERIFICATION_UNAVAILABLE",
      message: "The BIP-322 verification operation failed.",
    });
  });
});
