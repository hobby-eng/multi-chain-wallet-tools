import { afterEach, describe, expect, it, vi } from 'vitest';
import { secureRandomBytes } from '../src/secure-random.js';

const originalCrypto = globalThis.crypto;
afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  vi.restoreAllMocks();
});

describe('secureRandomBytes', () => {
  it('uses Web Crypto and returns exactly the filled bytes', () => {
    const getRandomValues = vi.fn((output: Uint8Array) => {
      output.set([1, 2, 3, 4]);
      return output;
    });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } });
    expect(secureRandomBytes(4)).toEqual(Uint8Array.of(1, 2, 3, 4));
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Web Crypto randomness is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    expect(() => secureRandomBytes(16)).toThrow(/Secure randomness is unavailable/u);
  });

  it('rejects lengths outside the Web Crypto per-call limit', () => {
    expect(() => secureRandomBytes(65_537)).toThrow(/0 to 65536/u);
  });
});
