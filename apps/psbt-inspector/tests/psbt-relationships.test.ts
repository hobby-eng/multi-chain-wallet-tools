import { describe, expect, it } from 'vitest';
import { keyAggregate } from '@scure/btc-signer/musig2.js';
import { bytesToHex, hexToBytes, secp256k1 } from '@ckd/core/crypto.js';
import { parsePsbt, validateMusigPsbtFields, type PsbtPair } from '../src/psbt.js';
import vectors from './independent-audit/official-vectors.json';

const G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const H = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5';
const J = bytesToHex(secp256k1.getPublicKey(Uint8Array.from({ length: 32 }, (_, index) => index === 31 ? 3 : 0), true));
const magic = Buffer.from('70736274ff', 'hex');

function u32(value: number): Buffer { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; }
function compact(value: number): Buffer {
  if (value < 0xfd) return Buffer.from([value]);
  if (value <= 0xffff) return Buffer.from([0xfd, value & 0xff, value >>> 8]);
  throw new Error('Test helper only supports uint16 CompactSize values.');
}
function keyValue(key: Buffer, value: Buffer): Buffer {
  return Buffer.concat([compact(key.length), key, compact(value.length), value]);
}
function field(type: number, value: Buffer, keyData = Buffer.alloc(0)): Buffer {
  const encodedType = type < 0xfd ? Buffer.from([type]) : Buffer.from([0xfd, type & 0xff, type >>> 8]);
  return keyValue(Buffer.concat([encodedType, keyData]), value);
}
function map(fields: readonly Buffer[]): Buffer { return Buffer.concat([...fields, Buffer.from([0])]); }
const tx = Buffer.concat([
  u32(2), Buffer.from([1]), Buffer.alloc(32), u32(0), Buffer.from([0]), u32(0xffffffff),
  Buffer.from([1]), Buffer.from('8403000000000000', 'hex'), Buffer.from([1, 0x51]), u32(0),
]);
function v0(inputFields: readonly Buffer[]): string {
  return Buffer.concat([magic, map([field(0, tx)]), map(inputFields), map([])]).toString('base64');
}
function v2(outputAmount: Buffer, inputFields: readonly Buffer[] = [], globalFields: readonly Buffer[] = []): string {
  return Buffer.concat([
    magic,
    map([field(0xfb, u32(2)), field(2, u32(2)), field(4, Buffer.from([1])), field(5, Buffer.from([1])), ...globalFields]),
    map([field(14, Buffer.alloc(32)), field(15, u32(0)), ...inputFields]),
    map([field(3, outputAmount), field(4, Buffer.from([0x51]))]),
  ]).toString('base64');
}
function participantPair(aggregate: string, participants: readonly string[]): PsbtPair {
  return { type: 0x1an, keyData: hexToBytes(aggregate), value: hexToBytes(participants.join('')) };
}

// These fixtures originated as the independent audit's p5 adversarial probe.
// They are permanent regressions now, with direct assertions instead of log-only observations.
describe('PSBT cross-field relationship regressions', () => {
  it('checks BIP327 KeyAgg while retaining valid repeated participant keys', () => {
    const participants = [G, H];
    const aggregate = bytesToHex(keyAggregate(participants.map(hexToBytes)).aggPublicKey.toBytes(true));
    expect(() => validateMusigPsbtFields([participantPair(aggregate, participants)], 'input')).not.toThrow();
    expect(() => validateMusigPsbtFields([participantPair(G, participants)], 'input')).toThrow(/does not match KeyAgg/u);

    const repeated = [G, G];
    const repeatedAggregate = bytesToHex(keyAggregate(repeated.map(hexToBytes)).aggPublicKey.toBytes(true));
    expect(() => validateMusigPsbtFields([participantPair(repeatedAggregate, repeated)], 'input')).not.toThrow();
  });

  it('rejects a MuSig2 nonce or partial signature linked to a foreign participant when its aggregate list is supplied', () => {
    const participants = [G, H];
    const aggregate = bytesToHex(keyAggregate(participants.map(hexToBytes)).aggPublicKey.toBytes(true));
    const list = participantPair(aggregate, participants);
    const referenceKey = hexToBytes(`${J}${aggregate}`);
    const nonce: PsbtPair = { type: 0x1bn, keyData: referenceKey, value: hexToBytes(`${G}${H}`) };
    const partial: PsbtPair = { type: 0x1cn, keyData: referenceKey, value: Uint8Array.from({ length: 32 }, (_, index) => index === 31 ? 1 : 0) };
    expect(() => validateMusigPsbtFields([list, nonce], 'input')).toThrow(/participant is absent/u);
    expect(() => validateMusigPsbtFields([list, partial], 'input')).toThrow(/participant is absent/u);
  });

  it('rejects key-origin paths deeper than the one-byte BIP32 depth field can represent', () => {
    expect(() => parsePsbt(v0([field(6, Buffer.concat([Buffer.alloc(4), Buffer.alloc(4 * 256)]), Buffer.from(G, 'hex'))]), 'bitcoin')).toThrow(/255-level/u);
  });

  it('marks a control block whose internal key disagrees with PSBT_IN_TAP_INTERNAL_KEY', () => {
    const parsed = parsePsbt(v0([
      field(23, Buffer.from(G.slice(2), 'hex')),
      field(21, Buffer.from([0x51, 0xc0]), Buffer.concat([Buffer.from([0xc0]), Buffer.from(H.slice(2), 'hex')])),
    ]), 'bitcoin');
    expect(parsed.inputVerification.flat()).toContainEqual(expect.objectContaining({
      relationship: 'Taproot control-block internal key', status: 'failed',
    }));
  });

  it('rejects a non-DER ECDSA partial signature', () => {
    expect(() => parsePsbt(v0([field(2, Buffer.from([0xff]), Buffer.from(G, 'hex'))]), 'bitcoin')).toThrow(/strict-DER/u);
  });

  it('rejects individual and total amounts above Bitcoin MAX_MONEY', () => {
    expect(() => parsePsbt(v2(Buffer.from('0000000000000080', 'hex')), 'bitcoin')).toThrow(/MAX_MONEY/u);
  });

  it('marks official structurally valid but mismatched BIP174 scripts as failed relationships', () => {
    for (const name of [
      'redeemScript with non-witness UTXO does not match the scriptPubKey',
      'redeemScript with witness UTXO does not match the scriptPubKey',
      'witnessScript with witness UTXO does not match the redeemScript',
    ]) {
      const fixture = vectors.psbt['0174'].find((row) => row.name === name);
      expect(fixture, name).toBeDefined();
      const parsed = parsePsbt(fixture!.base64, 'bitcoin');
      expect(parsed.inputVerification.flat()).toContainEqual(expect.objectContaining({
        relationship: 'Redeem/witness script commitments', status: 'failed',
      }));
    }
  });

  it('marks mixed BIP370 locktime units failed without rejecting a valid PSBT container', () => {
    const fixture = vectors.psbt['0370'].find((row) => row.name.includes('Input 1 has PSBT_IN_REQUIRED_HEIGHT_LOCKTIME of 10000, Input 2 has PSBT_IN_REQUIRED_TIME_LOCKTIME'));
    expect(fixture).toBeDefined();
    const parsed = parsePsbt(fixture!.base64, 'bitcoin');
    expect(parsed.inputVerification.flat()).toContainEqual(expect.objectContaining({
      relationship: 'PSBT v2 locktime requirements', status: 'failed',
    }));
  });

  it('preserves unknown transaction-modifiable flag bits and labels them not verified', () => {
    const parsed = parsePsbt(v2(Buffer.alloc(8), [], [field(6, Buffer.from([0xf8]))]), 'bitcoin');
    expect(parsed.globalVerification).toContainEqual(expect.objectContaining({
      relationship: 'PSBT transaction-modifiable flags', status: 'not-verified',
    }));
  });
});
