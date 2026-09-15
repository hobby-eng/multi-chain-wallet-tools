import { hexToBytes } from '@noble/hashes/utils.js';
import { entropyToEnglishMnemonic } from '@ckd/core/bip39.js';
import { describe, expect, it } from 'vitest';
import { decodeCompactSeedQr, decodeStandardSeedQr, encodeCompactSeedQr, encodeStandardSeedQr } from '../src/seedqr.js';

const VECTORS = [
  {
    mnemonic:
      'attack pizza motion avocado network gather crop fresh patrol unusual wild holiday candy pony ranch winter theme error hybrid van cereal salon goddess expire',
    standard: '011513251154012711900771041507421289190620080870026613431420201617920614089619290300152408010643',
    compact: '0e74b64107f94cc0ccfae6a13dcbec3662154fec67e0e00999c07892597d190a',
  },
  {
    mnemonic:
      'atom solve joy ugly ankle message setup typical bean era cactus various odor refuse element afraid meadow quick medal plate wisdom swap noble shallow',
    standard: '011416550964188800731119157218870156061002561932122514430573003611011405110613292018175411971576',
    compact: '0e59dde276009317f1275f1389888078c99368d1e82489b5f629531fc5b6a56e',
  },
  {
    mnemonic:
      'sound federal bonus bleak light raise false engage round stock update render quote truck quality fringe palace foot recipe labor glow tortoise potato still',
    standard: '166206750203018810361417065805941507171219081456140818651401074412730727143709940798183613501710',
    compact: 'cfca8c658bc81962549252bc7ac3ba5b0b01d26bcae89f2b5ecebe263dcb2a36',
  },
  {
    mnemonic: 'forum undo fragile fade shy sign arrest garment culture tube off merit',
    standard: '073318950739065415961602009907670428187212261116',
    compact: '5bbd9d71a8ec7990831aff359d426545',
  },
  {
    mnemonic: 'good battle boil exact add seed angle hurry success glad carbon whisper',
    standard: '080301540200062600251559007008931730078802752004',
    compact: '6462686427203385c2337dd84c5089fd',
  },
] as const;
const VECTOR = VECTORS[3];

describe('SeedSigner SeedQR vectors', () => {
  it('matches all five published SeedSigner vectors in both encodings', () => {
    for (const vector of VECTORS) {
      expect(encodeStandardSeedQr(vector.mnemonic)).toBe(vector.standard);
      expect(decodeStandardSeedQr(vector.standard)).toBe(vector.mnemonic);
      expect(Buffer.from(encodeCompactSeedQr(vector.mnemonic)).toString('hex')).toBe(vector.compact);
      expect(decodeCompactSeedQr(hexToBytes(vector.compact))).toBe(vector.mnemonic);
    }
  });

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
