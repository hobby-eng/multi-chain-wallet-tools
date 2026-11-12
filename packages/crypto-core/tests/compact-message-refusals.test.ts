import { describe, expect, it } from "vitest";
import { encodeP2pkh, hash160, secp256k1 } from "../src/crypto.js";
import { signCompactP2pkhMessage, verifyCompactP2pkhMessage } from "../src/compact-message.js";
import { isCompactSignature } from "../src/compact-message-internal.js";

const MESSAGE = "offline message fixture";
const key = Uint8Array.from([...new Uint8Array(31), 1]);
const address = encodeP2pkh(hash160(secp256k1.getPublicKey(key, true)), 0x00);
const signature = signCompactP2pkhMessage(key, address, MESSAGE, "bitcoin", "mainnet").signature;
// Header 31, s = 1, and an r that names no point: 0, and 5, whose x^3 + 7 is no square mod p
// (checked with Python's pow(v, (p - 1) / 2, p)).
const ZERO_R =
  "HwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=";
const OFF_CURVE_R =
  "HwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE=";

describe("the compact signature's shape", () => {
  it("recognises a compact signature, with or without surrounding white space", () => {
    expect(isCompactSignature(signature)).toBe(true);
    expect(isCompactSignature(`  ${signature}\n`)).toBe(true);
    expect(isCompactSignature(ZERO_R)).toBe(true);
  });

  it.each([
    ["text that is not Base64", "not a signature"],
    ["64 bytes", btoa("a".repeat(64))],
    ["66 bytes", btoa("\x1f".repeat(66))],
    ["header 26", btoa(`\x1a${"a".repeat(64)}`)],
    ["header 35, a BIP137 SegWit header", btoa(`#${"a".repeat(64)}`)],
    ["a BIP-322 simple signature", "smpAkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2Q="],
    ["empty text", ""],
  ])("does not take %s for one", (_name, text) => {
    expect(isCompactSignature(text)).toBe(false);
  });
});

describe("compact verification refuses a signature that names no public key", () => {
  it.each([
    ["r = 0", ZERO_R],
    ["r off the curve", OFF_CURVE_R],
  ])("refuses %s with RECOVERY_FAILED, not the curve library's error", (_name, text) => {
    expect(() => verifyCompactP2pkhMessage(address, MESSAGE, text, "bitcoin", "mainnet")).toThrow(
      expect.objectContaining({
        code: "RECOVERY_FAILED",
        message: "No public key can be recovered from this compact signature.",
      }),
    );
  });

  it("still answers false for a well-formed signature of another message", () => {
    expect(verifyCompactP2pkhMessage(address, "other", signature, "bitcoin", "mainnet")).toBe(
      false,
    );
  });
});
