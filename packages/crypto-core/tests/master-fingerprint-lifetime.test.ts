import { afterEach, expect, it, vi } from "vitest";
import { HdKeyFaults } from "@ckd/test-support/hd-key-faults.js";
import { masterFingerprintFromSeed } from "../src/bip39.js";

afterEach(() => vi.restoreAllMocks());

it("retires the master node after its public fingerprint service refuses", () => {
  const faults = new HdKeyFaults();
  faults.refusePublicAtDepth(0);
  faults.refuseFingerprintAtDepth(0);
  const seed = new Uint8Array(16).fill(1);
  try {
    expect(() => masterFingerprintFromSeed(seed)).toThrow();
    expect(faults.roots).toHaveLength(1);
    for (const root of faults.roots) expect(faults.wasWiped(root)).toBe(true);
    expect(seed).toEqual(new Uint8Array(16).fill(1));
  } finally {
    faults.wipe();
    seed.fill(0);
  }
});
