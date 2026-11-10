import { describe, expect, it } from "vitest";
import { hexToBytes, p2pkhScriptHex } from "@ckd/core/crypto.js";

describe("the P2PKH output script", () => {
  it("wraps a 20-byte hash in OP_DUP OP_HASH160 … OP_EQUALVERIFY OP_CHECKSIG", () => {
    // BIP44's first Bitcoin address of "abandon … about", 1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA.
    const hash = hexToBytes("d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa");
    expect(p2pkhScriptHex(hash)).toBe("76a914d986ed01b7a22225a70edbf2ba7cfb63a15cb3aa88ac");
    expect(() => p2pkhScriptHex(new Uint8Array(19))).toThrow(/20 bytes/u);
  });
});
