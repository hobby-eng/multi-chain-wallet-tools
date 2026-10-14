import { describe, expect, it } from "vitest";
import type { ResultField } from "@ckd/core/types.js";
import { matchedTargetField } from "../src/address-search.js";

// The one comparison of a search target with a derived row, used by the search and by the
// reveal that re-derives what it found (AUD-024 family 26). Synthetic public values only.

const field = (key: string, value: string, role?: ResultField["role"]): ResultField =>
  ({ key, label: key, value, ...(role === undefined ? {} : { role }) }) as ResultField;

const fields = [
  field("address", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT", "paymentAddress"),
  field("fingerprint", "73C5DA0A"),
];

describe("a search target compared with a derived row", () => {
  it("compares a payment address exactly, unless the coin has its own rule", () => {
    expect(
      matchedTargetField({}, fields, { address: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT" })?.key,
    ).toBe("address");
    // Base58 is case-sensitive: another case is another address.
    expect(
      matchedTargetField({}, fields, { address: "1boatslrhtknngkdxeeobr76b53letTPYT" }),
    ).toBeUndefined();
    // A coin's own rule, such as Ethereum's checksum casing, decides for its addresses.
    const caseless = {
      addressesEqual: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
    };
    expect(
      matchedTargetField(caseless, fields, { address: "1boatslrhtknngkdxeeobr76b53letTPYT" })?.key,
    ).toBe("address");
  });

  it("compares named fields without regard to case, and only those fields", () => {
    expect(
      matchedTargetField({}, fields, { address: "73c5da0a", fieldKeys: ["fingerprint"] })?.key,
    ).toBe("fingerprint");
    expect(
      matchedTargetField({}, fields, {
        address: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
        fieldKeys: ["fingerprint"],
      }),
    ).toBeUndefined();
  });
});
