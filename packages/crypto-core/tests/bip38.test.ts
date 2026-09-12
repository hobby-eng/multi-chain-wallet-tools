import { describe, expect, it } from 'vitest';
import { decryptBip38, encryptBip38 } from '../src/bip38.js';

describe('BIP38 non-EC-multiplied keys', () => {
  it('matches the official compressed Bitcoin vector', async () => {
    const encryptedKey = '6PYNKZ1EAgYgmQfmNVamxyXVWHzK5s6DGhwP4J5o44cvXdoY7sRzhtpUeo';
    const decrypted = await decryptBip38(encryptedKey, 'TestingOneTwoThree', { p2pkh: 0x00 });
    try {
      expect(decrypted.compressed).toBe(true);
      expect(decrypted.address).toBe('164MQi977u9GUteHr4EPH27VkkdxmfCvGW');
      await expect(encryptBip38(
        decrypted.privateKey,
        decrypted.compressed,
        'TestingOneTwoThree',
        { p2pkh: 0x00 },
      )).resolves.toEqual({
        encryptedKey,
        address: decrypted.address,
      });
    } finally {
      decrypted.privateKey.fill(0);
    }
  }, 30_000);

  it('rejects a wrong passphrase', async () => {
    await expect(decryptBip38(
      '6PYLtMnXvfG3oJde97zRyLYFZCYizPU5T3LwgdYJz1fRhh16bU7u6PPmY7',
      'wrong',
      { p2pkh: 0x00 },
    )).rejects.toThrow(/passphrase/u);
  }, 30_000);
});
