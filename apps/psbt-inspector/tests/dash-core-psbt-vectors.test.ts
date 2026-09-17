import { describe, expect, it } from 'vitest';
import vectors from './upstream/dash-core-rpc-psbt.json';
import { parsePsbt } from '../src/psbt.js';
import { pairName } from '../src/psbt-presentation.js';
import { bytesToHex } from '@ckd/core/crypto.js';

const DASH_V0_UNKNOWN_KEY =
  'cHNidP8BAD8CAAAAAf//////////////////////////////////////////AAAAAAD/////AQAAAAAAAAAAA2oBAAAAAAAACg8BAgMEBQYHCAkPAQIDBAUGBwgJCgsMDQ4PAAA=';

// Exact upstream fixture:
// https://github.com/dashpay/dash/blob/728f5055836c6d29806412fc7223ac8fe05af991/test/functional/data/rpc_psbt.json
// SHA-256: 026112af3403edc0b02746352abbdd8d3ab727febdb1f88ae7d5746e023256aa
describe('Dash Core rpc_psbt.json conformance', () => {
  it.each(vectors.valid.map((value, index) => [index, value] as const))(
    'accepts official valid vector %i',
    (_index, value) => {
      expect(() => parsePsbt(value, 'dash')).not.toThrow();
    },
  );

  it.each(vectors.invalid.map((value, index) => [index, value] as const))(
    'rejects official invalid vector %i',
    (_index, value) => {
      expect(() => parsePsbt(value, 'dash')).toThrow();
    },
  );

  it('preserves registered singleton prefixes with extra key data as unknown records', () => {
    const witnessPrefix = parsePsbt(vectors.valid[2]!, 'dash');
    expect(witnessPrefix.inputs[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 1n, keyData: Uint8Array.of(0) })]),
    );
    expect(witnessPrefix.inputUtxos[0]).toBeNull();

    const witnessScriptPrefix = parsePsbt(vectors.valid[3]!, 'dash');
    expect(witnessScriptPrefix.inputs[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 5n, keyData: Uint8Array.of(0) })]),
    );

    const finalWitnessPrefix = parsePsbt(vectors.valid[4]!, 'dash');
    expect(finalWitnessPrefix.inputs[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 8n, keyData: Uint8Array.of(0) })]),
    );
  });

  it('accepts and exposes Dash Core v0 unknown key type 0x0f without treating it as a BIP370 v2 field', () => {
    const parsed = parsePsbt(DASH_V0_UNKNOWN_KEY, 'dash');
    expect(parsed.version).toBe(0);
    const unknown = parsed.inputs[0]?.find((item) => item.type === 0x0fn);
    expect(unknown).toBeDefined();
    expect(pairName('input', unknown!.type, 'dash')).toBe('Unknown / passthrough Dash field · type 0x0f');
    expect(bytesToHex(unknown!.keyData)).toBe('010203040506070809');
    expect(bytesToHex(unknown!.value)).toBe('0102030405060708090a0b0c0d0e0f');
  });
});
