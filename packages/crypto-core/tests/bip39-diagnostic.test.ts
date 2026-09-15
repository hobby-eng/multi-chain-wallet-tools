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
    expect(diagnostic.words).toHaveLength(12);
    expect(diagnostic.words[0]).toEqual({
      position: 1,
      word: 'abandon',
      wordlistIndex: 0,
      indexHex: '0x000',
      bits: '00000000000',
    });
    expect(diagnostic.words[11]).toEqual({
      position: 12,
      word: 'about',
      wordlistIndex: 3,
      indexHex: '0x003',
      bits: '00000000011',
    });
    expect(diagnostic.construction).toEqual({
      entropyHex: '00000000000000000000000000000000',
      entropyBinary: '0'.repeat(128),
      providedChecksum: '0011',
      expectedChecksum: '0011',
      mnemonicBinary: `${'0'.repeat(128)}0011`,
      wordIndexes: [...Array(11).fill(0), 3],
    });
    const seed = mnemonicToSeed(MNEMONIC);
    try {
      expect(masterFingerprintFromSeed(seed)).toBe('73c5da0a');
    } finally {
      seed.fill(0);
    }
  });

  it.each([
    [12, 'about', 128, '0011'],
    [15, 'address', 160, '11011'],
    [18, 'agent', 192, '100111'],
    [21, 'admit', 224, '0011101'],
    [24, 'art', 256, '01100110'],
  ] as const)(
    'matches the official all-zero %i-word construction vector',
    (wordCount, finalWord, entropyBits, checksum) => {
      const phrase = [...Array(wordCount - 1).fill('abandon'), finalWord].join(' ');
      const diagnostic = diagnoseMnemonic(phrase);
      expect(diagnostic.checksumValid).toBe(true);
      expect(diagnostic.construction).toMatchObject({
        entropyHex: '0'.repeat(entropyBits / 4),
        entropyBinary: '0'.repeat(entropyBits),
        providedChecksum: checksum,
        expectedChecksum: checksum,
      });
      expect(diagnostic.construction?.mnemonicBinary).toBe(`${'0'.repeat(entropyBits)}${checksum}`);
      expect(diagnostic.words.at(-1)?.word).toBe(finalWord);
    },
  );

  it('identifies an unknown word by position and suggests abandon for a transposition', () => {
    const diagnostic = diagnoseMnemonic(MNEMONIC.replace('abandon abandon', 'abandon abandno'));
    expect(diagnostic.allWordsKnown).toBe(false);
    expect(diagnostic.checksumValid).toBe(false);
    expect(diagnostic.construction).toBeNull();
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
