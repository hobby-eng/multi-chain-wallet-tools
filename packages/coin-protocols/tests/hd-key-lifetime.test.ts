import { afterEach, expect, it, vi } from "vitest";
import { HDKey } from "@scure/bip32";
import { HdKeyFaults } from "@ckd/test-support/hd-key-faults.js";
import { deriveDashPlatform } from "../src/coins/dash/platform.js";
import { deriveDashIdentityAuthenticationKey } from "../src/coins/dash/identity.js";

afterEach(() => vi.restoreAllMocks());

it.each(["derive", "summary", "leaf", "dispose", "leaf dispose"])(
  "retires Platform root and child resources after a %s refusal",
  (stage) => {
    const faults = new HdKeyFaults();
    const seed = new Uint8Array(16).fill(1);
    if (stage === "derive") faults.refuseRootDerivation(1);
    if (stage === "summary") faults.refuseExtendedAtDepth(5);
    if (stage === "leaf") faults.refusePublicAtDepth(6);
    if (stage === "dispose") faults.throwAfterWipeAtDepth(5);
    if (stage === "leaf dispose") faults.throwAfterWipeAtDepth(6);
    try {
      expect(() =>
        deriveDashPlatform({ seed, network: "mainnet", account: 0, branch: 0, start: 0, count: 1 }),
      ).toThrow();
      expect(faults.roots).toHaveLength(1);
      for (const node of [...faults.roots, ...faults.returned])
        expect(faults.wasWiped(node)).toBe(true);
      for (const bytes of faults.privateCopies) expect(bytes).toEqual(new Uint8Array(bytes.length));
      expect(seed).toEqual(new Uint8Array(16).fill(1));
    } finally {
      faults.wipe();
      seed.fill(0);
    }
  },
);

it("retires Identity child copies after a public-key refusal while preserving its borrowed root", () => {
  const root = HDKey.fromMasterSeed(new Uint8Array(16).fill(1));
  const faults = new HdKeyFaults();
  faults.refusePublicAtDepth(7);
  try {
    expect(() => deriveDashIdentityAuthenticationKey(root, "mainnet", 0)).toThrow();
    expect(faults.returned).toHaveLength(1);
    for (const node of faults.returned) expect(faults.wasWiped(node)).toBe(true);
    expect(faults.wasWiped(root)).toBe(false);
    for (const bytes of faults.privateCopies) expect(bytes).toEqual(new Uint8Array(bytes.length));
    expect(root.privateKey).not.toBeNull();
  } finally {
    faults.wipe();
    root.wipePrivateData();
  }
});
