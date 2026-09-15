import { hexToBytes } from '@noble/hashes/utils.js';
import { entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import { describe, expect, it } from 'vitest';
import { decodeCompactSeedQr, decodeStandardSeedQr, encodeCompactSeedQr, encodeStandardSeedQr } from '../src/seedqr.js';

const VECTOR = {
  mnemonic: 'forum undo fragile fade shy sign arrest garment culture tube off merit',
  standard: '073318950739065415961602009907670428187212261116',
  compact: '5bbd9d71a8ec7990831aff359d426545',
};

describe('SeedSigner SeedQR vectors', () => {
  it('encodes and restores Standard SeedQR', () => {
    expect(encodeStandardSeedQr(VECTOR.mnemonic)).toBe(VECTOR.standard);
    expect(decodeStandardSeedQr(VECTOR.standard)).toBe(VECTOR.mnemonic);
  });

  it('encodes and restores CompactSeedQR binary data', () => {
    expect(Buffer.from(encodeCompactSeedQr(VECTOR.mnemonic)).toString('hex')).toBe(VECTOR.compact);
    expect(decodeCompactSeedQr(hexToBytes(VECTOR.compact))).toBe(VECTOR.mnemonic);
  });

  it.each([
    [12, 16],
    [15, 20],
    [18, 24],
    [21, 28],
    [24, 32],
  ] as const)('round-trips the standard %i-word BIP39 length in both encodings', (wordCount, entropyBytes) => {
    const mnemonic = entropyToEnglishMnemonic(new Uint8Array(entropyBytes));
    const standard = encodeStandardSeedQr(mnemonic);
    const compact = encodeCompactSeedQr(mnemonic);
    expect(standard).toHaveLength(wordCount * 4);
    expect(compact).toHaveLength(entropyBytes);
    expect(decodeStandardSeedQr(standard)).toBe(mnemonic);
    expect(decodeCompactSeedQr(compact)).toBe(mnemonic);
  });

  it('does not mutate compact entropy and canonicalizes harmless mnemonic whitespace', () => {
    const entropy = hexToBytes(VECTOR.compact);
    const original = entropy.slice();
    expect(decodeCompactSeedQr(entropy)).toBe(VECTOR.mnemonic);
    expect(entropy).toEqual(original);
    expect(encodeStandardSeedQr('  ' + VECTOR.mnemonic.replaceAll(' ', '   ') + '  ')).toBe(VECTOR.standard);
  });

  it('rejects invalid lengths, word indices, and checksum', () => {
    expect(() => decodeStandardSeedQr('0'.repeat(44))).toThrow(/48, 60, 72, 84, or 96/u);
    expect(() => decodeStandardSeedQr(`9999${'0000'.repeat(11)}`)).toThrow(/outside/u);
    expect(() => decodeCompactSeedQr(new Uint8Array(22))).toThrow(/16, 20, 24, 28, or 32/u);
    expect(() => decodeStandardSeedQr('abcd')).toThrow(/decimal digits/u);
    expect(() => encodeStandardSeedQr(VECTOR.mnemonic.replace('forum', 'abandon'))).toThrow(/checksum/u);
  });
});
