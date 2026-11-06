import { afterEach, expect, it, vi } from "vitest";
import { HdKeyFaults } from "@ckd/test-support/hd-key-faults.js";
import { deriveSilentPayment } from "../src/workers/silent-payment.js";

afterEach(() => vi.restoreAllMocks());

it.each(["second path", "dispose"])(
  "retires Silent Payment roots and paths after %s fails",
  async (stage) => {
    const faults = new HdKeyFaults();
    const seed = new Uint8Array(16).fill(1);
    if (stage === "second path") faults.refuseRootDerivation(2);
    else faults.throwAfterWipeAtDepth(5);
    try {
      await expect(deriveSilentPayment(seed, "mainnet", 0)).rejects.toThrow();
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
