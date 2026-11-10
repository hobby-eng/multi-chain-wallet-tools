import { describe, expect, it } from "vitest";
import { STRKEY_PUBLIC_KEY, STRKEY_SECRET_SEED, strKeyVersion } from "../src/strkey.js";

// The first account ID and secret seed of the public "abandon … about" phrase at m/44'/148'/0'.
const ACCOUNT_ID = "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX";
const SECRET_SEED = "SBUV3MRWKNS6AYKZ6E6MOUVF2OYMON3MIUASWL3JLY5E3ISDJFELYBRZ";

describe("StrKey shape", () => {
  it("reads the version byte of a key's StrKey, whose first letter it sets", () => {
    expect([STRKEY_PUBLIC_KEY, STRKEY_SECRET_SEED]).toEqual([48, 144]);
    expect(strKeyVersion(ACCOUNT_ID)).toBe(STRKEY_PUBLIC_KEY);
    expect(strKeyVersion(SECRET_SEED)).toBe(STRKEY_SECRET_SEED);
  });

  it("does not check the checksum, so a seed with a typo keeps its version", () => {
    expect(strKeyVersion(`${SECRET_SEED.slice(0, -1)}A`)).toBe(STRKEY_SECRET_SEED);
  });

  it.each([
    ["one character short", SECRET_SEED.slice(1)],
    ["one character long", `${SECRET_SEED}A`],
    ["lower case", SECRET_SEED.toLowerCase()],
    ["outside base32", `${SECRET_SEED.slice(0, -1)}1`],
    ["empty", ""],
  ])("has no version for a value %s", (_, value) => {
    expect(strKeyVersion(value)).toBeUndefined();
  });
});
