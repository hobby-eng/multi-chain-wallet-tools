import { describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({ passwords: [] as Uint8Array[] }));

vi.mock('@noble/hashes/pbkdf2.js', () => ({
  pbkdf2(_hash: unknown, password: Uint8Array): Uint8Array {
    captured.passwords.push(password);
    throw new Error('synthetic KDF failure');
  },
}));

describe('SLIP-39 exceptional secret lifecycle', () => {
  it('wipes the per-round password when the KDF throws', async () => {
    const { createSlip39Shares } = await import('../src/slip39.js');
    expect(() =>
      createSlip39Shares(new Uint8Array(16).fill(7), {
        groupThreshold: 1,
        groups: [{ memberThreshold: 2, memberCount: 3 }],
        passphrase: 'public test password',
        randomBytes: (length) => new Uint8Array(length).fill(4),
      }),
    ).toThrow('synthetic KDF failure');
    expect(captured.passwords).toHaveLength(1);
    expect(captured.passwords[0]?.every((byte) => byte === 0)).toBe(true);
  });
});
