import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ random: [] as Uint8Array[] }));

vi.mock('@ckd/core/secure-random.js', () => ({
  secureRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length).fill(0xa5);
    captured.random.push(bytes);
    return bytes;
  },
}));

vi.mock('@ckd/recovery-shamir-wasm/recovery_shamir_wasm.js', () => ({
  initSync: vi.fn(),
  split_shamir_shares: vi.fn(() => {
    throw new Error('synthetic split failure');
  }),
  recover_shamir_secret: vi.fn(),
}));

vi.mock('@ckd/recovery-shamir-wasm/recovery_shamir_wasm_bg.wasm', () => ({ default: new Uint8Array() }));

describe('CKD Shamir exceptional secret lifecycle', () => {
  it('wipes all WebCrypto randomness when the WASM split fails', async () => {
    const { createCkdShamirShares } = await import('../src/shamir.js');
    expect(() => createCkdShamirShares(new Uint8Array(16).fill(7), 2, 3, 'raw')).toThrow('synthetic split failure');
    expect(captured.random).toHaveLength(2);
    expect(captured.random.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
  });
});
