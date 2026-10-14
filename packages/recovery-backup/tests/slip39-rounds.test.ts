import { describe, expect, it } from "vitest";
import { runSlip39SelfTest } from "../src/self-test-slip39.js";
import { recoverSlip39Shares } from "../src/slip39.js";
import vectors from "./slip39-official-vectors.json";

describe("SLIP-39 round ordering", () => {
  it("keeps the single published startup answer and the bounded encode/decode check", () => {
    expect(runSlip39SelfTest().passed).toBe(true);
  });

  it("still refuses the published invalid-checksum example before the KDF", () => {
    const [description, shares, expected] = vectors[1]!;
    expect(description).toContain("invalid checksum");
    expect(expected).toBe("");
    expect(() => recoverSlip39Shares(shares as string[], "TREZOR")).toThrow(/checksum/iu);
  });
});
