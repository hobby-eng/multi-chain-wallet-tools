import { describe, expect, it, vi } from "vitest";
import type { ResultField } from "@ckd/core/types.js";
import { BITCOIN_MESSAGE_SIGNING } from "../src/coins/bitcoin/message-signing.js";
import { MessageSigners } from "../src/coins/message-signing.js";

const startupFailure = vi.hoisted(() => new Error("Synthetic external WASM initialization fault"));
vi.mock("btcutil-js", () => ({
  init: () => {
    throw startupFailure;
  },
}));

// Public generator key; these refusal cases must finish before the external WASM starts.
const key = Uint8Array.from([...new Uint8Array(31), 1]);
const request = {
  format: "bitcoin-bip322-native",
  address: "public address",
  message: "public message",
  network: "mainnet",
} as const;
const script = (value: string): ResultField[] => [
  { key: "scriptPubKey", label: "scriptPubKey", value, secret: false },
];

describe("Bitcoin message signing refuses invalid requests before initializing its backend", () => {
  it.each([
    { name: "a short key", change: { key: Uint8Array.of(0x11) }, code: "INVALID_KEY" },
    { name: "an empty message", change: { message: "" }, code: "EMPTY_MESSAGE" },
    { name: "an unknown network", change: { network: "unknown network" }, code: "INVALID_NETWORK" },
    { name: "an unknown format", change: { format: "unknown format" }, code: "INVALID_FORMAT" },
    { name: "a script that is not hex", change: { script: "not hex" }, code: "INVALID_SCRIPT" },
  ])("refuses $name as $code without using external WASM", async ({ change, code }) => {
    const { key: changedKey = key, script: changedScript = "00".repeat(22), ...fields } = change;
    // A wrong network value is fed on purpose, to check that it is refused (TS-04).
    const changed = { ...request, ...fields } as typeof request;
    await expect(
      Promise.resolve().then(() =>
        BITCOIN_MESSAGE_SIGNING.sign(changedKey, changed, script(changedScript)),
      ),
    ).rejects.toMatchObject({ code });
  });

  it("refuses an unknown composed signing format instead of treating it as Taproot", async () => {
    const signers = new MessageSigners([BITCOIN_MESSAGE_SIGNING]);
    await expect(
      signers.sign(key, { ...request, format: "unknown format" }, []),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });

  it("keeps an external verifier startup failure distinct from an invalid signature", async () => {
    await expect(BITCOIN_MESSAGE_SIGNING.verify(request, "public signature")).rejects.toMatchObject(
      {
        code: "VERIFICATION_UNAVAILABLE",
        message: "The BIP-322 verification operation failed.",
      },
    );
  });
});
