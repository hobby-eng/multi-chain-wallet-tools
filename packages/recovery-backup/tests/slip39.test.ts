import { describe, expect, it } from 'vitest';
import vectors from './slip39-official-vectors.json';
import { recoverSlip39Shares, createSlip39Shares, parseSlip39Share } from '../src/slip39.js';

describe('SLIP-39', () => {
  it('matches every official Trezor recovery vector', () => {
    for (const [description, mnemonics, secretHex] of vectors as [string, string[], string, string][]) {
      if (secretHex.length === 0) {
        expect(() => recoverSlip39Shares(mnemonics, 'TREZOR'), description).toThrow();
      } else {
        expect(Buffer.from(recoverSlip39Shares(mnemonics, 'TREZOR')).toString('hex'), description).toBe(secretHex);
      }
    }
  });

  it('creates recoverable extendable and original shares with deterministic entropy', () => {
    for (const extendable of [false, true]) {
      let counter = 0;
      const randomBytes = (length: number): Uint8Array =>
        Uint8Array.from({ length }, () => (counter++ * 29 + 17) & 0xff);
      const secret = Uint8Array.from({ length: 16 }, (_, index) => index * 7 + 3);
      const groups = createSlip39Shares(secret, {
        groupThreshold: 2,
        groups: [
          { memberThreshold: 2, memberCount: 3 },
          { memberThreshold: 1, memberCount: 1 },
          { memberThreshold: 2, memberCount: 2 },
        ],
        passphrase: 'correct horse',
        extendable,
        iterationExponent: 0,
        randomBytes,
      });
      const selected = [groups[0]![0]!, groups[0]![2]!, groups[1]![0]!];
      expect(recoverSlip39Shares(selected, 'correct horse')).toEqual(secret);
      expect(parseSlip39Share(selected[0]!).extendable).toBe(extendable);
    }
  });

  it('round-trips every BIP39 entropy size in current and legacy formats', () => {
    for (const length of [16, 20, 24, 28, 32]) {
      for (const extendable of [false, true]) {
        let counter = length;
        const secret = Uint8Array.from({ length }, (_, index) => (index * 11 + length) & 0xff);
        const original = secret.slice();
        const groups = createSlip39Shares(secret, {
          groupThreshold: 1,
          groups: [{ memberThreshold: 2, memberCount: 3 }],
          passphrase: 'ASCII symbols !@#$%^&*()',
          extendable,
          iterationExponent: 0,
          randomBytes: (size) => Uint8Array.from({ length: size }, () => ++counter & 0xff),
        });
        expect(recoverSlip39Shares([groups[0]![2]!, groups[0]![0]!], 'ASCII symbols !@#$%^&*()')).toEqual(original);
        expect(secret).toEqual(original);
      }
    }
  });

  it('accepts normalized casing and distinguishes a wrong passphrase without false validation', () => {
    let counter = 0;
    const secret = new Uint8Array(16).fill(23);
    const groups = createSlip39Shares(secret, {
      groupThreshold: 1,
      groups: [{ memberThreshold: 1, memberCount: 1 }],
      passphrase: 'Correct',
      iterationExponent: 0,
      randomBytes: (length) => Uint8Array.from({ length }, () => ++counter & 0xff),
    });
    const share = groups[0]![0]!;
    expect(recoverSlip39Shares([share.toUpperCase()], 'Correct')).toEqual(secret);
    expect(recoverSlip39Shares([share], 'Wrong')).not.toEqual(secret);
  });

  it('rejects mixed sets, duplicate insufficiency, invalid passphrases, and modified words', () => {
    let counter = 0;
    const randomBytes = (length: number): Uint8Array => Uint8Array.from({ length }, () => ++counter & 0xff);
    const options = {
      groupThreshold: 1,
      groups: [{ memberThreshold: 2, memberCount: 3 }],
      iterationExponent: 0,
      randomBytes,
    } as const;
    const first = createSlip39Shares(new Uint8Array(16).fill(1), options)[0]!;
    const second = createSlip39Shares(new Uint8Array(16).fill(2), options)[0]!;
    expect(() => recoverSlip39Shares([first[0]!])).toThrow(/complete/u);
    expect(() => recoverSlip39Shares([first[0]!, second[1]!])).toThrow(/different sets/u);
    expect(() => recoverSlip39Shares([first[0]!, first[0]!])).toThrow(/complete/u);
    const words = first[0]!.split(' ');
    words.at(-1) === 'zero' ? (words[words.length - 1] = 'yoga') : (words[words.length - 1] = 'zero');
    expect(() => parseSlip39Share(words.join(' '))).toThrow(/checksum/u);
    expect(() => createSlip39Shares(new Uint8Array(16), { ...options, passphrase: 'кириллица' })).toThrow(/ASCII/u);
  });
});
