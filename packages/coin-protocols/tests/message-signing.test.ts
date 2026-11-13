import { describe, expect, it } from "vitest";
import { MessageSigners, type CoinMessageSigning } from "../src/coins/message-signing.js";
import { BITCOIN_MESSAGE_SIGNING } from "../src/coins/bitcoin/message-signing.js";
import { DASH_MESSAGE_SIGNING } from "../src/coins/dash/message-signing.js";

const key = Uint8Array.from([...new Uint8Array(31), 1]);
// The self-tests' pinned answers for the public key 1 (message-signer-self-test-*.ts).
const DASH = {
  format: "dash-compact",
  address: "XmN7PQYWKn5MJFna5fRYgP6mxT2F7xpekE",
  message: "Offline message signing self-test",
  network: "mainnet",
  signature:
    "H5Oj4LXfIgqbHRLIbCGux6wQGf3ZtC8iQt79foa4M9nkadAXIRsCL4X8sJWAH9iwOpV5w6N8mS1jxrRp+8Nxapc=",
} as const;

/** A coin double that records which of its operations ran. */
function recordingCoin(formats: readonly string[], calls: string[]): CoinMessageSigning {
  return {
    formats: Object.fromEntries(formats.map((format) => [format, []])),
    sign: (_key, request) => {
      calls.push(`sign ${request.format}`);
      return { signature: "public", format: request.format, verified: true };
    },
    verify: (request) => {
      calls.push(`verify ${request.format}`);
      return true;
    },
  };
}

describe("a build's message signers", () => {
  it("hand each format to the coin that owns it", async () => {
    const calls: string[] = [];
    const signers = new MessageSigners([
      recordingCoin(["first-a", "first-b"], calls),
      recordingCoin(["second"], calls),
    ]);
    const request = { address: "public", message: "public", network: "mainnet" } as const;
    await signers.sign(key, { ...request, format: "first-b" }, []);
    await signers.verify({ ...request, format: "second" }, "public signature");
    expect(calls).toEqual(["sign first-b", "verify second"]);
  });

  it("reproduce Dash's pinned signature and its verification", async () => {
    const signers = new MessageSigners([DASH_MESSAGE_SIGNING]);
    const { signature, ...request } = DASH;
    expect(await signers.sign(key, request, [])).toEqual({
      signature,
      format: "Dash Core compact P2PKH",
      verified: true,
    });
    expect(await signers.verify(request, signature)).toBe(true);
    expect(await signers.verify({ ...request, message: "another message" }, signature)).toBe(false);
  });

  it("refuse a format of a coin the build does not hold, before using the key", async () => {
    const dashOnly = new MessageSigners([DASH_MESSAGE_SIGNING]);
    const { signature, ...request } = DASH;
    const bitcoin = { ...request, format: "bitcoin-compact" };
    await expect(dashOnly.sign(new Uint8Array(1), bitcoin, [])).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
    await expect(dashOnly.verify(bitcoin, signature)).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });
    await expect(
      new MessageSigners([BITCOIN_MESSAGE_SIGNING]).verify(request, signature),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FORMAT" });
  });

  it.each([
    ["blank signature text", " ", "EMPTY_SIGNATURE"],
    ["signature text that is not a string", 7, "INVALID_SIGNATURE_TEXT"],
  ])("refuse %s before the coin verifies", async (_name, signature, code) => {
    const calls: string[] = [];
    const signers = new MessageSigners([recordingCoin(["dash-compact"], calls)]);
    const { signature: _unused, ...request } = DASH;
    await expect(signers.verify(request, signature)).rejects.toMatchObject({ code });
    expect(calls).toEqual([]);
  });

  it("verify the empty message that the standards allow, but no oversized one", async () => {
    const calls: string[] = [];
    const signers = new MessageSigners([recordingCoin(["dash-compact"], calls)]);
    const { signature, ...request } = DASH;
    expect(await signers.verify({ ...request, message: "" }, signature)).toBe(true);
    await expect(
      signers.verify({ ...request, message: "a".repeat(65537) }, signature),
    ).rejects.toMatchObject({ code: "MESSAGE_TOO_LARGE" });
    expect(calls).toEqual(["verify dash-compact"]);
  });
});
