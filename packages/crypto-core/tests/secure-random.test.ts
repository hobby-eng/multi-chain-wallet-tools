import { afterEach, describe, expect, it, vi } from "vitest";
import { randomFillSync } from "node:crypto";
import { checkSecureRandom, secureRandomBytes } from "../src/secure-random.js";

const originalCrypto = globalThis.crypto;
afterEach(() => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  vi.restoreAllMocks();
});

describe("secureRandomBytes", () => {
  it("uses Web Crypto and returns exactly the filled bytes", () => {
    const getRandomValues = vi.fn((output: Uint8Array) => {
      output.set([1, 2, 3, 4]);
      return output;
    });
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues } });
    expect(secureRandomBytes(4)).toEqual(Uint8Array.of(1, 2, 3, 4));
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Web Crypto randomness is unavailable", () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    expect(() => secureRandomBytes(16)).toThrow(/Secure randomness is unavailable/u);
  });

  it("rejects lengths outside the Web Crypto per-call limit", () => {
    expect(() => secureRandomBytes(65_537)).toThrow(/0 to 65536/u);
  });
});

describe("checkSecureRandom", () => {
  it("passes the real Web Crypto source", () => {
    expect(() => checkSecureRandom()).not.toThrow();
  });

  const sources: [string, (output: Uint8Array) => void][] = [
    ["a constant", (output) => output.fill(7)],
    ["a source that repeats its draws", (output) => output.set(output.map((_, i) => i))],
  ];
  it("refuses a source that fills only part of the buffer (AUD-023)", () => {
    const getRandomValues = (output: Uint8Array) => {
      output.fill(0);
      randomFillSync(output.subarray(0, output.length / 2));
      return output;
    };
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: { getRandomValues } });
    expect(() => checkSecureRandom()).toThrow(/part of a draw stayed empty/u);
  });

  for (const [name, fill] of sources) {
    it(`refuses ${name}`, () => {
      const getRandomValues = (output: Uint8Array) => {
        fill(output);
        return output;
      };
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: { getRandomValues },
      });
      expect(() => checkSecureRandom()).toThrow(/repeats itself/u);
    });
  }
});
