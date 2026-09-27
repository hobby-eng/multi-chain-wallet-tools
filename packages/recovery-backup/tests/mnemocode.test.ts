import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { describe, expect, it } from 'vitest';
import {
  decodeMnemoCode,
  detectMnemoCodeFormats,
  encodeMnemoCode,
  MNEMOCODE_FORMATS,
  MNEMOCODE_VERSION,
  parseMnemoCode,
  parseMnemoCodeDate,
  parseMnemoCodeDates,
  recoverMnemoCodeLegacyLastWords,
  recoverMnemoCodeWord,
} from '../src/mnemocode.js';

const zeroMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const dates = parseMnemoCodeDates('23-09-2026');

describe('MnemoCode 0.1.0 compatibility', () => {
  it('pins the version and published direct vectors', () => {
    expect(MNEMOCODE_VERSION).toBe('0.1.0');
    expect(encodeMnemoCode(zeroMnemonic, 'direct', 'indexes').payload).toBe('1 1 1 1 1 1 1 1 1 1 1 4');
    expect(encodeMnemoCode(zeroMnemonic, 'direct', 'unicode').payload).toBe(
      '768476847684768476847684768476847684768476845728',
    );
    expect(encodeMnemoCode(zeroMnemonic, 'direct', 'colors').payload).toBe(
      '#000064 #1EAB91 #3D0964 #5BB491 #7A1264 #98BD91 #B71B64 #D5C694',
    );
  });

  it('prints portable color Unicode code points and reads legacy Private Use symbols', () => {
    const encoded = encodeMnemoCode(zeroMnemonic, 'direct', 'colors-unicode');
    expect(encoded.payload).toMatch(/^(?:[0-9A-F]{4})+$/u);
    const legacySymbols = encoded.payload
      .match(/.{4}/gu)!
      .map((point) => String.fromCodePoint(Number.parseInt(point, 16)))
      .join('');
    expect(decodeMnemoCode(legacySymbols, { mode: 'direct', format: 'colors-unicode' }).mnemonic).toBe(zeroMnemonic);
  });

  it('matches the published checksum-valid Seedshift vector', () => {
    const encoded = encodeMnemoCode(zeroMnemonic, 'seedshift', 'english', dates);
    expect(encoded.payload).toBe('wool abuse actual wool abuse actual wool abuse actual wool abuse congress');
    expect(decodeMnemoCode(encoded.record, { mode: 'direct', format: 'auto', dates }).mnemonic).toBe(zeroMnemonic);
  });

  it('matches the documented legacy Seedshift vector', () => {
    const source = 'oppose duck hello neglect reveal key humor mosquito road evoke flock hedgehog';
    const legacyDates = parseMnemoCodeDates('10-07-1963 27-04-1956 31-01-1994');
    const encoded = encodeMnemoCode(source, 'seedshift-legacy', 'english', legacyDates);
    expect(encoded.payload).toBe('mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital');
    expect(decodeMnemoCode(encoded.record, { mode: 'direct', format: 'auto', dates: legacyDates }).mnemonic).toBe(
      source,
    );
  });

  it.each([16, 20, 24, 28, 32])(
    'round-trips every representation at %i entropy bytes in direct and Seedshift modes',
    (size) => {
      const mnemonic = entropyToMnemonic(
        Uint8Array.from({ length: size }, (_, index) => index),
        wordlist,
      );
      for (const format of MNEMOCODE_FORMATS) {
        for (const mode of ['direct', 'seedshift', 'seedshift-legacy'] as const) {
          const encoded = encodeMnemoCode(mnemonic, mode, format, mode === 'direct' ? [] : dates);
          expect(
            decodeMnemoCode(encoded.record, {
              mode: 'direct',
              format: 'auto',
              dates: mode === 'direct' ? [] : dates,
            }).mnemonic,
          ).toBe(mnemonic);
        }
      }
    },
  );

  it.each([
    [16, 128],
    [20, 64],
    [24, 32],
    [28, 16],
    [32, 8],
  ])('enumerates the bounded legacy valid-last-word set for %i entropy bytes', (size, count) => {
    const mnemonic = entropyToMnemonic(
      Uint8Array.from({ length: size }, (_, index) => index),
      wordlist,
    );
    const encoded = encodeMnemoCode(mnemonic, 'seedshift-legacy-valid', 'colors', dates);
    const decoded = decodeMnemoCode(encoded.record, { mode: 'direct', format: 'auto', dates });
    expect(decoded.mode).toBe('seedshift-legacy-valid');
    expect(decoded.candidates).toHaveLength(count);
    expect(decoded.candidates).toContain(mnemonic);
  });

  it('detects strict raw formats without guessing ambiguous input', () => {
    for (const format of MNEMOCODE_FORMATS) {
      const payload = encodeMnemoCode(zeroMnemonic, 'direct', format).payload;
      expect(detectMnemoCodeFormats(payload)).toEqual([format]);
    }
    const ambiguous = '76 84 57 28 90 19 59 27 62 11 89 81 66 42 75 28 50 11 52 30 57 30 62 10';
    expect(detectMnemoCodeFormats(ambiguous)).toEqual(['indexes', 'unicode']);
    expect(() => decodeMnemoCode(ambiguous, { mode: 'direct', format: 'auto' })).toThrow(/ambiguous/u);
  });

  it('rejects malformed dates, indexes, oversized input and missing Seedshift dates', () => {
    for (const value of ['29-02-1900', '31-04-2026', '01-01-0000', '01-13-2026']) {
      expect(() => parseMnemoCodeDate(value)).toThrow();
    }
    expect(() => parseMnemoCode('1e3 1 1 1 1 1 1 1 1 1 1 1', 'indexes')).toThrow(/decimal/u);
    expect(() => parseMnemoCode('a'.repeat(64 * 1024 + 1), 'english')).toThrow(/64 KiB/u);
    expect(() => encodeMnemoCode(zeroMnemonic, 'seedshift', 'english')).toThrow(/at least one date/u);
  });

  it.each([
    [16, 128],
    [20, 64],
    [24, 32],
    [28, 16],
    [32, 8],
  ])('recovers every checksum-valid forgotten-word candidate for %i entropy bytes', (size, count) => {
    const mnemonic = entropyToMnemonic(new Uint8Array(size), wordlist);
    const words = mnemonic.split(' ');
    words[4] = '?';
    const candidates = recoverMnemoCodeWord(words.join(' '));
    expect(candidates).toHaveLength(count);
    expect(candidates.map((candidate) => candidate.mnemonic)).toContain(mnemonic);
    expect(candidates.every((candidate) => candidate.position === 5)).toBe(true);
    expect(candidates.every((candidate) => candidate.checksumBits.length === words.length / 3)).toBe(true);
  });

  it('exposes the word index and exact checksum bits to the browser API', () => {
    expect(recoverMnemoCodeWord(zeroMnemonic.replace(/about$/u, '?'))).toContainEqual({
      position: 12,
      word: 'about',
      wordIndex: 4,
      mnemonic: zeroMnemonic,
      checksumBits: '0011',
    });
  });

  it('enumerates valid replacements for an exact legacy final word', () => {
    const legacy = 'mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital';
    const prefix = legacy.split(' ').slice(0, -1).join(' ');
    const candidates = recoverMnemoCodeLegacyLastWords(legacy);
    expect(candidates).toHaveLength(128);
    expect(candidates.every((candidate) => candidate.position === 12)).toBe(true);
    expect(candidates.filter((candidate) => candidate.preservesLegacyEntropy)).toHaveLength(1);
    expect(candidates.every((candidate) => candidate.mnemonic.split(' ').slice(0, -1).join(' ') === prefix)).toBe(true);
  });

  it('rejects missing, repeated, and malformed forgotten-word placeholders', () => {
    expect(() => recoverMnemoCodeWord(zeroMnemonic)).toThrow(/exactly one/u);
    expect(() => recoverMnemoCodeWord(zeroMnemonic.replaceAll('abandon', '?'))).toThrow(/exactly one/u);
    expect(() => recoverMnemoCodeWord(zeroMnemonic.replace('abandon', 'notaword').replace('about', '?'))).toThrow(
      /position 1/u,
    );
  });
});
