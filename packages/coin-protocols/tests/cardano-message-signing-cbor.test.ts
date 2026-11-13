// The strict CBOR subset of Cardano's message signing (coins/cardano/message-signing-cbor.ts): a
// full structure, an empty, a malformed and a partial input, and each encoding that RFC 8949's
// deterministic rules exclude. The full structure is cardano-signer's published COSE_Sign1
// (gitmachtl/cardano-signer @3cc4a74 README.md, "Hello world"). Public test data only.
import { describe, expect, it } from "vitest";
import { bytesToHex, hexToBytes } from "@ckd/core/crypto.js";
import {
  CborMap,
  decodeCbor,
  encodeCbor,
  isCborError,
  type CborValue,
} from "@ckd/coins/cardano/message-signing-cbor.js";

const COSE_SIGN1 =
  "84582aa201276761646472657373581d617863b5c43bdf0a06608abc82f0573a549714ff69166074dcdde393d8a166686173686564f44b48656c6c6f20776f726c645840fc58155f0cee05bc00e7299af1df1f159ac82a46a055786b259657934eff346eec81349d4678ceabc79f213c66a2bdbfd4ea5d9ebdc630bee5ac9cce75cfc001";

/** The code of the refusal of `hex`, or "accepted". */
function refusalOf(hex: string, tags: readonly number[] = []): string {
  try {
    decodeCbor(hexToBytes(hex), tags);
    return "accepted";
  } catch (cause) {
    expect(isCborError(cause)).toBe(true);
    return (cause as { code: string }).code;
  }
}

describe("Cardano's strict CBOR subset", () => {
  it("reads cardano-signer's COSE_Sign1 and writes it back byte for byte", () => {
    const value = decodeCbor(hexToBytes(COSE_SIGN1));
    expect(Array.isArray(value)).toBe(true);
    const [protectedBytes, unprotected, payload, signature] = value as readonly CborValue[];
    expect(bytesToHex(protectedBytes as Uint8Array)).toBe(
      "a201276761646472657373581d617863b5c43bdf0a06608abc82f0573a549714ff69166074dcdde393d8",
    );
    expect((unprotected as CborMap).entries).toEqual([["hashed", false]]);
    expect(new TextDecoder().decode(payload as Uint8Array)).toBe("Hello world");
    expect((signature as Uint8Array).length).toBe(64);
    expect(bytesToHex(encodeCbor(value))).toBe(COSE_SIGN1);
    const header = decodeCbor(protectedBytes as Uint8Array) as CborMap;
    expect(header.keys()).toEqual([1, "address"]);
    expect(header.get(1)).toBe(-8);
  });

  it("refuses an empty, a malformed and a partial input", () => {
    expect(refusalOf("")).toBe("cardano.cbor.truncated");
    // Additional information 28 is reserved.
    expect(refusalOf("1c")).toBe("cardano.cbor.type");
    expect(refusalOf(COSE_SIGN1.slice(0, 120))).toBe("cardano.cbor.truncated");
    expect(refusalOf(`${COSE_SIGN1}00`)).toBe("cardano.cbor.trailing");
  });

  it.each([
    ["24 in two bytes", "1817"],
    ["255 in three bytes", "1900ff"],
    ["65535 in five bytes", "1a0000ffff"],
    ["2^32 - 1 in nine bytes", "1b00000000ffffffff"],
    ["-8 in two bytes", "3807"],
    ["a short length in two bytes", "580100"],
  ])("refuses an argument longer than it needs: %s", (_, hex) => {
    expect(refusalOf(hex)).toBe("cardano.cbor.form");
  });

  it("accepts each argument at the least value of its width", () => {
    for (const [hex, value] of [
      ["1818", 24],
      ["190100", 256],
      ["1a00010000", 65536],
      ["1b0000000100000000", 2 ** 32],
      ["37", -24],
      ["3818", -25],
    ] as const) {
      expect(decodeCbor(hexToBytes(hex))).toBe(value);
      expect(bytesToHex(encodeCbor(value))).toBe(hex);
    }
  });

  it.each([
    ["an indefinite byte string", "5f4100ff"],
    ["an indefinite array", "9f00ff"],
    ["an indefinite map", "bf0000ff"],
    ["a break", "ff"],
  ])("refuses %s", (_, hex) => {
    expect(refusalOf(hex)).toBe("cardano.cbor.form");
  });

  it("refuses map keys repeated or out of their encodings' order, and keys of other types", () => {
    expect(refusalOf("a201000100")).toBe("cardano.cbor.order");
    expect(refusalOf("a202000100")).toBe("cardano.cbor.order");
    // A text key before an integer key, and -1 (0x20) before 1 (0x01).
    expect(refusalOf("a1616100")).toBe("accepted");
    expect(refusalOf("a2616100010000")).toBe("cardano.cbor.order");
    expect(refusalOf("a220000100")).toBe("cardano.cbor.order");
    expect(refusalOf("a201002000")).toBe("accepted");
    expect(refusalOf("a1400000")).toBe("cardano.cbor.key");
  });

  it("admits a tag only where the caller does, and only that one", () => {
    expect(refusalOf(`d2${COSE_SIGN1}`, [18])).toBe("accepted");
    expect(refusalOf(`d2${COSE_SIGN1}`)).toBe("cardano.cbor.tag");
    expect(refusalOf(`d3${COSE_SIGN1}`, [18])).toBe("cardano.cbor.tag");
    expect(refusalOf("81d200", [18])).toBe("cardano.cbor.tag");
  });

  it("refuses floats, undefined, other simple values and text that is not UTF-8", () => {
    for (const hex of ["f93c00", "fa3f800000", "fb3ff0000000000000", "f7", "f820", "e0"])
      expect(refusalOf(hex)).toBe("cardano.cbor.type");
    expect(refusalOf("62c328")).toBe("cardano.cbor.text");
    // A byte order mark is kept: "\u{FEFF}a" has one encoding, and it is not "a"'s.
    expect(decodeCbor(hexToBytes("64efbbbf61"))).toBe("\u{FEFF}a");
    expect(bytesToHex(encodeCbor("\u{FEFF}a"))).toBe("64efbbbf61");
    expect(decodeCbor(hexToBytes("83f4f5f6"))).toEqual([false, true, null]);
  });

  it("refuses nesting deeper than eight levels, and counts beyond the input before allocating", () => {
    expect(refusalOf(`${"81".repeat(8)}00`)).toBe("accepted");
    expect(refusalOf(`${"81".repeat(9)}00`)).toBe("cardano.cbor.depth");
    expect(refusalOf("9b0000000100000000")).toBe("cardano.cbor.truncated");
    expect(refusalOf("bb0000000100000000")).toBe("cardano.cbor.truncated");
    expect(refusalOf("5b0000000100000000")).toBe("cardano.cbor.truncated");
    // Beyond 2^53 - 1 an integer is refused rather than rounded.
    expect(refusalOf("1b0020000000000000")).toBe("cardano.cbor.type");
  });

  it("writes a map's entries in its keys' deterministic order", () => {
    const map = new CborMap([
      [-2, new Uint8Array(1)],
      [1, 1],
      ["address", 0],
      [-1, 6],
      [3, -8],
    ]);
    expect(bytesToHex(encodeCbor(map))).toBe("a5010103272006214100676164647265737300");
  });
});
