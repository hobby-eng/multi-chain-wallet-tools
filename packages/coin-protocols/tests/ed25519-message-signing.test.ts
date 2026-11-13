// The Ed25519 coins' message signing against published vectors and check/c_vectors.py's answers
// (tmp/message-signing-2026-11-11): RFC 8032's reference Ed25519 in pure Python, which first
// reproduces RFC 8032's TEST 1 to 3, SEP-53's signatures and near/intents' verifications.
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58, base64 } from "@scure/base";
import { hexToBytes, sha256 } from "@ckd/core/crypto.js";
import type { MessageSigningRequest } from "../src/coins/message-signing.js";
import { SOLANA_MESSAGE_SIGNING } from "../src/coins/solana/message-signing.js";
import { solanaOffchainMessage } from "../src/coins/solana/message-signing-offchain.js";
import { STELLAR_MESSAGE_SIGNING } from "../src/coins/stellar/message-signing.js";
import { sep53SignedBytes } from "../src/coins/stellar/message-signing-sep53.js";
import { NEAR_MESSAGE_SIGNING } from "../src/coins/near/message-signing.js";
import { TON_MESSAGE_SIGNING } from "../src/coins/ton/message-signing.js";
import { tonWalletAddress } from "../src/coins/ton/contracts.js";
import { stellarAccountId } from "../src/coins/stellar/strkey.js";

/** RFC 8032's TEST 1 seed, a public test key, and its public key. */
const SEED = hexToBytes("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
const PUBLIC_KEY = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const MESSAGE = "Offline message signing self-test";
const request = (
  format: string,
  address: string,
  message = MESSAGE,
  inputs?: Record<string, string>,
): MessageSigningRequest => ({
  format,
  address,
  message,
  network: "mainnet",
  ...(inputs === undefined ? {} : { inputs }),
});

describe("Solana", () => {
  const address = "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z";

  it("writes solana-sdk's version 0 layout and its published hashes", () => {
    const ascii = solanaOffchainMessage(new TextEncoder().encode("Test Message"));
    expect([...ascii]).toEqual([
      255, 115, 111, 108, 97, 110, 97, 32, 111, 102, 102, 99, 104, 97, 105, 110, 0, 0, 12, 0, 84,
      101, 115, 116, 32, 77, 101, 115, 115, 97, 103, 101,
    ]);
    expect(base58.encode(sha256(ascii))).toBe("HG5JydBGjtjTfD3sSn21ys5NTWPpXzmqifiGC2BVUjkD");
    const utf8 = solanaOffchainMessage(new TextEncoder().encode("Тестовое сообщение"));
    expect(base58.encode(sha256(utf8))).toBe("6GXTveatZQLexkX4WeTpJ3E7uk1UojRXpKp43c4ArSun");
  });

  it.each([
    [new Uint8Array(1212).fill(0x61), 0],
    [new Uint8Array(1212).fill(0x0a), 1],
    [new Uint8Array(1213).fill(0x61), 2],
    [new Uint8Array(65515).fill(0x61), 2],
  ])("chooses the format the crate chooses for %#", (message, format) => {
    const bytes = solanaOffchainMessage(message);
    expect(bytes[17]).toBe(format);
    expect(bytes[18]! + bytes[19]! * 256).toBe(message.length);
  });

  it.each([
    [new Uint8Array(0), "EMPTY_MESSAGE"],
    [new Uint8Array(65516), "MESSAGE_TOO_LONG"],
  ])("refuses a message that version 0 cannot hold (%#)", (message, code) => {
    expect(() => solanaOffchainMessage(message)).toThrow(expect.objectContaining({ code }));
  });

  it.each([
    [
      "solana-raw",
      "Wv1YJpdMUAvAXis38EBgLfgUDxesyjepTJfeCRgV4cdUNgvLCAxEsyWqHsfLN4Tpv3dFjd4Y4KtXikxz7qwu1iz",
    ],
    [
      "solana-offchain-v0",
      "2RY7h7a1eXLHWbJ2SKbTsvVkWVijTg7oWtwKDDP3wpfVx4BNAYXNEKPyd4EsFgs3FShzmL4w6hXNWpEsc5noHYSA",
    ],
  ])("signs and verifies %s as the independent implementation does", async (format, signature) => {
    const signed = await SOLANA_MESSAGE_SIGNING.sign(SEED, request(format, address), []);
    expect(signed).toMatchObject({ signature, verified: true });
    expect(await SOLANA_MESSAGE_SIGNING.verify(request(format, address), ` ${signature}\n`)).toBe(
      true,
    );
    expect(await SOLANA_MESSAGE_SIGNING.verify(request(format, address, "other"), signature)).toBe(
      false,
    );
  });

  it("keeps the two formats apart: neither signature verifies in the other", async () => {
    const raw = await SOLANA_MESSAGE_SIGNING.sign(SEED, request("solana-raw", address), []);
    expect(
      await SOLANA_MESSAGE_SIGNING.verify(request("solana-offchain-v0", address), raw.signature),
    ).toBe(false);
  });
});

describe("Stellar SEP-53", () => {
  const seed = hexToBytes("148112b05e2c693932e5adf3e53601f3521032eebeb3abb5e316902f0a40a024");
  const address = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

  it.each([
    [
      "Hello, World!",
      "fO5dbYhXUhBMhe6kId/cuVq/AfEnHRHEvsP8vXh03M1uLpi5e46yO2Q8rEBzu3feXQewcQE5GArp88u6ePK6BA==",
    ],
    [
      "こんにちは、世界！",
      "CDU265Xs8y3OWbB/56H9jPgUss5G9A0qFuTqH2zs2YDgTm+++dIfmAEceFqB7bhfN3am59lCtDXrCtwH2k1GBA==",
    ],
  ])("signs SEP-53's published %j", async (message, signature) => {
    const signed = await STELLAR_MESSAGE_SIGNING.sign(
      seed,
      request("stellar-sep53", address, message),
      [],
    );
    expect(signed.signature).toBe(signature);
    expect(
      await STELLAR_MESSAGE_SIGNING.verify(request("stellar-sep53", address, message), signature),
    ).toBe(true);
  });

  it("signs SEP-53's published binary message through the standard's bytes", () => {
    const message = base64.decode("2zZDP1sa1BVBfLP7TeeMk3sUbaxAkUhBhDiNdrksaFo=");
    expect(base64.encode(ed25519.sign(sep53SignedBytes(message), seed))).toBe(
      "VA1+7hefNwv2NKScH6n+Sljj15kLAge+M2wE7fzFOf+L0MMbssA1mwfJZRyyrhBORQRle10X1Dxpx+UOI4EbDQ==",
    );
  });

  it("refuses a signature that is not 64 bytes in Base64, and answers false for another account", async () => {
    await expect(
      Promise.resolve().then(() =>
        STELLAR_MESSAGE_SIGNING.verify(request("stellar-sep53", address), "AA=="),
      ),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    const signed = await STELLAR_MESSAGE_SIGNING.sign(seed, request("stellar-sep53", address), []);
    const other = stellarAccountId(hexToBytes(PUBLIC_KEY));
    expect(
      await STELLAR_MESSAGE_SIGNING.verify(request("stellar-sep53", other), signed.signature),
    ).toBe(false);
  });
});

describe("NEAR NEP-413", () => {
  const account = PUBLIC_KEY;
  const inputs = { recipient: "self-test.example", nonce: "00".repeat(32) };
  const answer =
    '{"accountId":"d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a","publicKey":"ed25519:FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z","signature":"UoLrTUKMBCy0D/IndFD6W9gOPba3dgJATnIoA3NrK+hCE2LyAmJyVHnEfxUxUgxtPvn7i3RmvuYFJThM1HNECw=="}';

  it("signs the independent implementation's response and verifies it or its bare signature", async () => {
    const signed = await NEAR_MESSAGE_SIGNING.sign(
      SEED,
      request("near-nep413", account, MESSAGE, inputs),
      [],
    );
    expect(signed.signature).toBe(answer);
    const bare = (JSON.parse(answer) as { signature: string }).signature;
    for (const pasted of [answer, bare])
      expect(
        await NEAR_MESSAGE_SIGNING.verify(request("near-nep413", account, MESSAGE, inputs), pasted),
      ).toBe(true);
  });

  it("verifies near/intents' published signature", async () => {
    const vector = request(
      "near-nep413",
      "e2e9cb7ac57cb46d4da1ce1d1cc2c33bdfe17407c517916b522724a8ea2c6c50",
      "Hello, world!",
      {
        recipient: "intents.near",
        nonce: base64.encode(new Uint8Array(32)),
      },
    );
    const signature =
      "4v9iVIcaP+wYU8FntC8PFCSMTPf+9UUtwk2NvcXEvxg6twcyK014LV9aBVcbrkdsX37kHEc/MALmAIZeRrddDw==";
    expect(await NEAR_MESSAGE_SIGNING.verify(vector, signature)).toBe(true);
  });

  it.each([
    ["recipient", { ...inputs, recipient: "self-test.example!" }],
    ["nonce", { ...inputs, nonce: `01${"00".repeat(31)}` }],
    ["callback URL", { ...inputs, callbackUrl: "https://self-test.example/" }],
  ])("refuses the signature once the %s changes", async (_name, changed) => {
    expect(
      await NEAR_MESSAGE_SIGNING.verify(request("near-nep413", account, MESSAGE, changed), answer),
    ).toBe(false);
  });

  it.each([
    [{ nonce: "00".repeat(32) }, "RECIPIENT_REQUIRED"],
    [{ ...inputs, recipient: "a\ud800" }, "INVALID_RECIPIENT"],
    [{ ...inputs, recipient: "a".repeat(257) }, "INVALID_RECIPIENT"],
    [{ ...inputs, nonce: "00".repeat(31) }, "INVALID_NONCE"],
    [{ ...inputs, nonce: base64.encode(new Uint8Array(31)) }, "INVALID_NONCE"],
    [{ recipient: "self-test.example" }, "INVALID_NONCE"],
    [{ ...inputs, callbackUrl: "a".repeat(2049) }, "INVALID_CALLBACK"],
  ])("refuses the inputs %j with %s", async (refused, code) => {
    await expect(
      Promise.resolve().then(() =>
        NEAR_MESSAGE_SIGNING.sign(SEED, request("near-nep413", account, MESSAGE, refused), []),
      ),
    ).rejects.toMatchObject({ code });
  });

  it("signs the same nonce the same way in hex and in Base64", async () => {
    const nonce = Uint8Array.from({ length: 32 }, (_, at) => at);
    const sign = async (text: string) =>
      (
        await NEAR_MESSAGE_SIGNING.sign(
          SEED,
          request("near-nep413", account, MESSAGE, { ...inputs, nonce: text }),
          [],
        )
      ).signature;
    const hex = [...nonce].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(await sign(base64.encode(nonce))).toBe(await sign(hex.toUpperCase()));
  });
});

describe("TON Connect signData", () => {
  const inputs = { domain: "self-test.example", timestamp: "1700000000", publicKey: PUBLIC_KEY };
  const w5 = "UQCUp64SJJ505dIdcgHDG1oD8JKMLXpQzu5W6lLFdQGtA8kY";
  const v4r2 = "UQDNrJfJFisuFBrURjgosqcO_fh2K5foNWPzUr7PkC6Ipteq";
  const textAnswer =
    '{"signature":"mZXkyg84ZQkiaEymJ5mDVL3S6yg7sjACReZIYyZlRFLcAe7czvHdPs05O6uDtTXqWX1mJlRadD3t7CtINmeNAg==","address":"0:94a7ae12249e74e5d21d7201c31b5a03f0928c2d7a50ceee56ea52c57501ad03","timestamp":1700000000,"domain":"self-test.example","payload":{"type":"text","text":"Offline message signing self-test"}}';
  const binaryAnswer =
    '{"signature":"xQZBdOr77lQz7BPvh/qTEnlnzdjnDwL1/0KmGvIg96OFwgiHLvwrHG0JmUeUAJgdopJUPQjgI0hS0M17QfN8Cg==","address":"0:cdac97c9162b2e141ad4463828b2a70efdf8762b97e83563f352becf902e88a6","timestamp":1700000000,"domain":"self-test.example","payload":{"type":"binary","bytes":"T2ZmbGluZSBtZXNzYWdlIHNpZ25pbmcgc2VsZi10ZXN0"}}';
  const binary = "4f66666c696e65206d657373616765207369676e696e672073656c662d74657374";

  it.each([
    ["ton-sign-data-text", w5, MESSAGE, textAnswer],
    ["ton-sign-data-binary", v4r2, binary, binaryAnswer],
  ])(
    "signs %s as the independent implementation does",
    async (format, address, message, answer) => {
      const signed = await TON_MESSAGE_SIGNING.sign(
        SEED,
        request(format, address, message, inputs),
        [],
      );
      expect(signed.signature).toBe(answer);
      expect(
        await TON_MESSAGE_SIGNING.verify(request(format, address, message, inputs), answer),
      ).toBe(true);
    },
  );

  it.each([
    [
      "ton-sign-data-text",
      "Hello, TON!".repeat(100),
      "1747759882",
      "e8Yo9tY0q23a8QRjdCsT8O3jy4KHN9nOGWLMgI+/5wNed8Gj0LaCrPAtZFzBokSZKydlUsDhxX0wsDwoINc9AQ==",
    ],
    [
      "ton-sign-data-binary",
      "48656C6C6F2C20544F4E21",
      "1747760435",
      "nPTBwWtHr85GlA65zUEIlPMVRLdCBsIlS7FlH5syz1sOSCt4ouglHlTTUX+uSwbG8jVGZn1j/2LczOcEUWmNAQ==",
    ],
  ])(
    "verifies near/intents' published %s signature",
    async (format, message, timestamp, signature) => {
      const vector = request(
        format,
        "0:f4809e5ffac9dc42a6b1d94c5e74ad5fd86378de675c805f2274d0055cbc9378",
        message,
        {
          domain: "ton-connect.github.io",
          timestamp,
          publicKey: "22e795a07e832fc9084ca35a488a711f1dbedef637d4e886a6997d93ee2c2e37",
        },
      );
      expect(await TON_MESSAGE_SIGNING.verify(vector, signature)).toBe(true);
    },
  );

  it("signs for each wallet of the key, and binds the wallet it signed for", async () => {
    const v3r2 = tonWalletAddress("v3r2", hexToBytes(PUBLIC_KEY));
    const signed = await TON_MESSAGE_SIGNING.sign(
      SEED,
      request("ton-sign-data-text", v3r2, MESSAGE, inputs),
      [],
    );
    expect(
      await TON_MESSAGE_SIGNING.verify(
        request("ton-sign-data-text", v3r2, MESSAGE, inputs),
        signed.signature,
      ),
    ).toBe(true);
    expect(
      await TON_MESSAGE_SIGNING.verify(
        request("ton-sign-data-text", w5, MESSAGE, inputs),
        signed.signature,
      ),
    ).toBe(false);
  });

  it.each([
    ["timestamp", { ...inputs, timestamp: "1700000001" }],
    ["domain", { ...inputs, domain: "other.example" }],
    [
      "public key of another key",
      { ...inputs, publicKey: "22e795a07e832fc9084ca35a488a711f1dbedef637d4e886a6997d93ee2c2e37" },
    ],
    ["missing public key", { domain: inputs.domain, timestamp: inputs.timestamp }],
  ])("answers false once the %s differs", async (_name, changed) => {
    expect(
      await TON_MESSAGE_SIGNING.verify(
        request("ton-sign-data-text", w5, MESSAGE, changed),
        textAnswer,
      ),
    ).toBe(false);
  });

  it.each([
    [MESSAGE, { ...inputs, domain: "" }, "DOMAIN_REQUIRED"],
    [MESSAGE, { ...inputs, domain: "app example" }, "INVALID_DOMAIN"],
    [MESSAGE, { ...inputs, domain: "a".repeat(254) }, "INVALID_DOMAIN"],
    [MESSAGE, { ...inputs, timestamp: "01" }, "INVALID_TIMESTAMP"],
    [MESSAGE, { ...inputs, timestamp: "-1" }, "INVALID_TIMESTAMP"],
    [MESSAGE, { ...inputs, timestamp: "9007199254740992" }, "INVALID_TIMESTAMP"],
  ])("refuses the text payload's inputs %#", async (message, refused, code) => {
    await expect(
      Promise.resolve().then(() =>
        TON_MESSAGE_SIGNING.sign(SEED, request("ton-sign-data-text", w5, message, refused), []),
      ),
    ).rejects.toMatchObject({ code });
  });

  it.each(["abc", "0x61", "zz"])(
    "refuses binary bytes %j that are not hex pairs",
    async (message) => {
      await expect(
        Promise.resolve().then(() =>
          TON_MESSAGE_SIGNING.sign(
            SEED,
            request("ton-sign-data-binary", v4r2, message, inputs),
            [],
          ),
        ),
      ).rejects.toMatchObject({ code: "INVALID_BYTES" });
    },
  );
});

describe("the Ed25519 coins' shared rules", () => {
  it("refuses the S + L twin of a signature, whose S is not reduced", async () => {
    const signature = base58.decode(
      "Wv1YJpdMUAvAXis38EBgLfgUDxesyjepTJfeCRgV4cdUNgvLCAxEsyWqHsfLN4Tpv3dFjd4Y4KtXikxz7qwu1iz",
    );
    // S + L satisfies the same equation; RFC 8032 requires S < L, so the twin is refused.
    const order = 2n ** 252n + 27742317777372353535851937790883648493n;
    let s = 0n;
    for (let at = 63; at >= 32; at -= 1) s = (s << 8n) | BigInt(signature[at]!);
    const twin = signature.slice();
    let value = s + order;
    for (let at = 32; at < 64; at += 1) {
      twin[at] = Number(value & 0xffn);
      value >>= 8n;
    }
    const address = "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z";
    expect(
      await SOLANA_MESSAGE_SIGNING.verify(request("solana-raw", address), base58.encode(twin)),
    ).toBe(false);
  });

  it.each(['{"signature":1}', '{"sig":"x"}', "{not json", "[]", "AA=="])(
    "refuses the response %j, which holds no 64-byte Base64 signature",
    async (pasted) => {
      const inputs = { recipient: "self-test.example", nonce: "00".repeat(32) };
      await expect(
        Promise.resolve().then(() =>
          NEAR_MESSAGE_SIGNING.verify(request("near-nep413", PUBLIC_KEY, MESSAGE, inputs), pasted),
        ),
      ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    },
  );

  it("refuses to sign for an address that is not the key's", async () => {
    await expect(
      Promise.resolve().then(() =>
        SOLANA_MESSAGE_SIGNING.sign(
          SEED,
          request(
            "solana-raw",
            base58.encode(
              hexToBytes("e2e9cb7ac57cb46d4da1ce1d1cc2c33bdfe17407c517916b522724a8ea2c6c50"),
            ),
          ),
          [],
        ),
      ),
    ).rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });
});
