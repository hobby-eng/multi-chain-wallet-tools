// Bitcoin's CompactSize: the forms Bitcoin Core's src/serialize.h writes and reads, at each
// boundary, and the non-minimal and truncated forms its ReadCompactSize refuses.
import { describe, expect, it } from "vitest";
import { encodeCompactSize, readCompactSize } from "../src/compact-size.js";
import { bytesToHex, hexToBytes } from "../src/crypto.js";

// Each value and its shortest form: one byte below 0xFD, then 0xFD, 0xFE or 0xFF and 2, 4 or 8
// little-endian bytes.
const FORMS = [
  [0, "00"],
  [0xfc, "fc"],
  [0xfd, "fdfd00"],
  [0xffff, "fdffff"],
  [0x1_0000, "fe00000100"],
  [0xffff_ffff, "feffffffff"],
  [0x1_0000_0000, "ff0000000001000000"],
  [Number.MAX_SAFE_INTEGER, "ffffffffffffff1f00"],
] as const;

describe("CompactSize", () => {
  it.each(FORMS)("writes and reads %i as %s", (value, form) => {
    expect(bytesToHex(encodeCompactSize(value))).toBe(form);
    const bytes = hexToBytes(`aa${form}bb`);
    expect(readCompactSize(bytes, 1)).toEqual({ value: BigInt(value), end: bytes.length - 1 });
  });

  it("refuses to write a negative, fractional or unsafe number", () => {
    for (const value of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() => encodeCompactSize(value)).toThrow(RangeError);
  });

  it("reads no form longer than it needs to be, and none the bytes cut short", () => {
    for (const form of [
      "fdfc00",
      "feffff0000",
      "ffffffffff00000000",
      "",
      "fd00",
      "fe000001",
      "ff00000000010000",
    ])
      expect(readCompactSize(hexToBytes(form), 0)).toBeUndefined();
  });
});
