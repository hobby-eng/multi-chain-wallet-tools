import { describe, expect, it } from "vitest";
import { assertAddressCount, BIP32_BRANCH_SIZE } from "../src/bip32-limits.js";
import {
  BLS_KEY_HEX,
  COMPRESSED_KEY_HEX,
  HASH160_HEX,
  normalizedHex,
  SEC1_KEY_HEX,
} from "../src/key-text.js";
import {
  BIP32_MAINNET_VERSIONS,
  BIP32_TESTNET_VERSIONS,
  bip32VersionsFor,
} from "../src/networks.js";
import { providerValues } from "../src/provider-values.js";
import { nonEmptyLines, textLines } from "../src/text-lines.js";

// The small shared rules of crypto-core that the tools read instead of copies of their own
// (AUD-024). Expected values come from the standards named, not from the code under test.

/** The public generator point, compressed, and its HASH160 (no wallet behind it). */
const POINT = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const POINT_HASH160 = "751e76e8199196d454941c45d1b3a323f1433bd6";

describe("the lines of pasted text", () => {
  it("reads Windows line ends as Unix ones and keeps line numbers", () => {
    expect(textLines("a\r\n\r\nb")).toEqual(["a", "", "b"]);
    expect(nonEmptyLines("  a \r\n\r\n b\n")).toEqual(["a", "b"]);
  });
});

describe("the hex spellings of public key material", () => {
  it("tells the kinds apart with or without 0x, in either case", () => {
    expect(COMPRESSED_KEY_HEX.test(POINT)).toBe(true);
    expect(COMPRESSED_KEY_HEX.test(`0x${POINT.toUpperCase()}`)).toBe(true);
    expect(COMPRESSED_KEY_HEX.test(`04${POINT.slice(2)}`)).toBe(false);
    expect(SEC1_KEY_HEX.test(`04${"ab".repeat(64)}`)).toBe(true);
    expect(HASH160_HEX.test(POINT_HASH160)).toBe(true);
    expect(HASH160_HEX.test(POINT)).toBe(false);
    expect(BLS_KEY_HEX.test("ab".repeat(48))).toBe(true);
    expect(normalizedHex(" 0xAB cd ")).toBe("abcd");
  });
});

describe("the number of addresses of one branch", () => {
  it("accepts 0 or 1 up to 2^31 and refuses everything else", () => {
    expect(BIP32_BRANCH_SIZE).toBe(2 ** 31);
    expect(assertAddressCount(BIP32_BRANCH_SIZE, "Count")).toBe(BIP32_BRANCH_SIZE);
    expect(assertAddressCount(0, "Count", 0)).toBe(0);
    for (const value of [0, -1, 1.5, BIP32_BRANCH_SIZE + 1, Number.NaN])
      expect(() => assertAddressCount(value, "Count")).toThrow(
        `Count must be an integer from 1 to ${BIP32_BRANCH_SIZE}.`,
      );
  });
});

describe("the serialization versions of extended keys", () => {
  it("are xprv/xpub on mainnet and tprv/tpub on test networks (BIP32)", () => {
    expect(BIP32_MAINNET_VERSIONS).toEqual({ private: 0x0488ade4, public: 0x0488b21e });
    expect(BIP32_TESTNET_VERSIONS).toEqual({ private: 0x04358394, public: 0x043587cf });
    expect(bip32VersionsFor("mainnet")).toBe(BIP32_MAINNET_VERSIONS);
    expect(bip32VersionsFor("regtest")).toBe(BIP32_TESTNET_VERSIONS);
  });
});

describe("the checks of a provider's answers", () => {
  const values = providerValues("Example provider");
  it("accepts well-formed values", () => {
    expect(values.record({ a: 1 }, "page")).toEqual({ a: 1 });
    expect(values.decimal(12, "amount")).toBe("12");
    expect(values.decimal(null, "amount", true)).toBe("0");
    expect(values.unsignedInteger("7", "count")).toBe(7);
    expect(values.timestamp(undefined, "date")).toBeNull();
  });
  it("refuses malformed values, naming the provider", () => {
    expect(() => values.record([], "page")).toThrow("Example provider returned malformed page.");
    expect(() => values.decimal("-1", "amount")).toThrow(
      "Example provider returned an invalid amount.",
    );
    expect(() => values.unsignedInteger(-1, "count")).toThrow(/invalid count/u);
    expect(() => values.timestamp("not a date", "date")).toThrow(/invalid date/u);
  });
});
