import { describe, expect, it } from 'vitest';
import { diagnoseMnemonic, masterFingerprintFromSeed, mnemonicToSeed } from '../src/bip39.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('BIP39 Seed Diagnostic', () => {
  it('reports the official zero-entropy phrase and BIP32 master fingerprint', () => {
    const diagnostic = diagnoseMnemonic(MNEMONIC);
    expect(diagnostic).toMatchObject({
      wordCount: 12,
      wordCountValid: true,
      allWordsKnown: true,
      checksumValid: true,
      entropyBits: 128,
      checksumBits: 4,
      unknownWords: [],
    });
    const seed = mnemonicToSeed(MNEMONIC);
    try {
      expect(masterFingerprintFromSeed(seed)).toBe('73c5da0a');
    } finally {
      seed.fill(0);
    }
  });

  it('identifies an unknown word by position and suggests abandon for a transposition', () => {
    const diagnostic = diagnoseMnemonic(MNEMONIC.replace('abandon abandon', 'abandon abandno'));
    expect(diagnostic.allWordsKnown).toBe(false);
    expect(diagnostic.checksumValid).toBe(false);
    expect(diagnostic.unknownWords).toEqual([
      expect.objectContaining({
        index: 1,
        word: 'abandno',
        suggestions: expect.arrayContaining(['abandon']),
      }),
    ]);
  });

  it('rejects non-English mnemonic words without treating Unicode passphrases as mnemonic words', () => {
    const diagnostic = diagnoseMnemonic(MNEMONIC.replace('about', 'пароль'));
    expect(diagnostic.unknownWords[0]).toMatchObject({ index: 11, word: 'пароль', suggestions: [] });
    const composed = mnemonicToSeed(MNEMONIC, 'пароль 中文 é 🔑');
    const decomposed = mnemonicToSeed(MNEMONIC, 'пароль 中文 e\u0301 🔑');
    expect(composed).toEqual(decomposed);
    composed.fill(0);
    decomposed.fill(0);
  });

  it('normalizes case, compatible Unicode and whitespace before validation', () => {
    const decorated = `  ${MNEMONIC.toUpperCase().replace('ABANDON', 'ＡＢＡＮＤＯＮ')}  `;
    expect(diagnoseMnemonic(decorated)).toMatchObject({ normalized: MNEMONIC, checksumValid: true });
  });
});
