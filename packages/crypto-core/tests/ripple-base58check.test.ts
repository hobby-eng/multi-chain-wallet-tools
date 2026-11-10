import { describe, expect, it } from "vitest";
import { hexToBytes } from "../src/crypto.js";
import { decodeRippleBase58Check, encodeRippleBase58Check } from "../src/ripple-base58check.js";

// The XRP Ledger's first classic address of the public "abandon … about" phrase, and the family
// seed of 16 zero bytes; both computed independently with Node's crypto.
const ADDRESS = "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3";
const ZERO_SEED = "sp6JS7f14BuwFY8Mw6bTtLKWauoUs";
const ZERO_SEED_PAYLOAD = hexToBytes(`21${"00".repeat(16)}`);

describe("Base58Check in Ripple's alphabet", () => {
  it("decodes a payload and encodes it back", () => {
    expect(decodeRippleBase58Check(ZERO_SEED)).toEqual(ZERO_SEED_PAYLOAD);
    expect(encodeRippleBase58Check(ZERO_SEED_PAYLOAD)).toBe(ZERO_SEED);
    const payload = decodeRippleBase58Check(ADDRESS);
    expect(payload).toHaveLength(21);
    expect(encodeRippleBase58Check(payload!)).toBe(ADDRESS);
  });

  it.each([
    ["a broken checksum", `${ADDRESS.slice(0, -1)}4`],
    ["a character outside the alphabet", `${ADDRESS.slice(0, -1)}0`],
    ["no payload beyond a checksum", "rrrr"],
    ["nothing", ""],
  ])("has no payload for %s", (_, text) => {
    expect(decodeRippleBase58Check(text)).toBeNull();
  });
});
