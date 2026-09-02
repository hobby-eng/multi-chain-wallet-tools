import { hexToBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { encodeDashShieldedAddress } from '@ckd/coins/dash/shielded-address.js';
import { buildDashShieldedResult } from '@ckd/coins/dash/shielded-result.js';
import { normalizeViewingKey } from '../src/viewing-key.js';
import { rowValue, value } from '@ckd/test-support/helpers.js';

const OFFICIAL_FIXED_JSON = JSON.stringify({
  spendingKey: '41ed14c33f0ac381ea4010e69591b4031e2c160b6fb6eb893958086b0ded5310',
  fullViewingKey: '4c66f3082f8300045544e392f9c83394ab80180a3146eee090506544b414e12feb9db9dc54b0110925d7e7f11948d8dd0cc775c588f4ce22e17046f4d338e81073eab1a0268a2b75beef1d23230b8eccc28baa08eebd6abfc78627271f428608',
  incomingViewingKey: 'fae18cbcf032c37f646b0e3f211bda62dc79535f5276abbf274f46ba1d28d571946102f72db50fd672aadddc8346c513221c82e3fbc0c62058a2effb9669f228',
  outgoingViewingKey: '610664bf12a9b8fcad9925757a91df439f49fe086c05d9ab005519e7ad0c2dfa',
  rows: [{
    index: 0,
    rawAddress: 'ee9f8174f92a3f035570ecbfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8',
  }],
});

describe('Dash Shielded display encoding', () => {
  it('matches the official Rust Bech32m output pin for the fixed-seed address', () => {
    const raw = hexToBytes(
      'ee9f8174f92a3f035570ecbfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8',
    );
    expect(encodeDashShieldedAddress(raw, 'tdash')).toBe(
      'tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq',
    );
  });

  it('rejects malformed raw address lengths', () => {
    expect(() => encodeDashShieldedAddress(new Uint8Array(42), 'dash')).toThrow(/43 bytes/u);
  });

  it('validates and formats the complete official WASM boundary result', () => {
    const result = buildDashShieldedResult(OFFICIAL_FIXED_JSON, {
      network: 'testnet', account: 0, start: 0, count: 1,
    });
    expect(result.pathTemplate).toBe("m/32'/1'/0' · external diversifier index i");
    expect(rowValue(result, 'address')).toBe(
      'tdash1zrhflqt5ly4r7q64wrktl6tf466x7h30vjkknaudxsckc3l28rp0qzzm27yta0683nnnd2qum8gyq',
    );
    expect(rowValue(result, 'diversifier')).toBe('ee9f8174f92a3f035570ec');
    expect(rowValue(result, 'diversifiedTransmissionKey')).toBe(
      'bfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8',
    );
    expect(rowValue(result, 'fullViewingKey')).toHaveLength(192);
    expect(rowValue(result, 'spendingKey')).toHaveLength(64);
    expect(value(result.summary, 'incomingViewingKey')).toHaveLength(128);
    expect(result.rows[0]?.basic.map(({ key }) => key)).toEqual(['address', 'spendingKey', 'fullViewingKey']);
    expect(result.watchOnly).toBeUndefined();
    expect(normalizeViewingKey(rowValue(result, 'fullViewingKey'))).toEqual({
      hex: rowValue(result, 'fullViewingKey'),
      kind: 'full',
    });
  });

  it('rejects malformed JSON, invalid lengths, and non-sequential rows at the TS boundary', () => {
    const options = { network: 'testnet' as const, account: 0, start: 0, count: 1 };
    expect(() => buildDashShieldedResult('{', options)).toThrow(/malformed JSON/u);
    expect(() => buildDashShieldedResult(OFFICIAL_FIXED_JSON.replace('ee9f', 'ee'), options)).toThrow(/raw address/u);
    expect(() => buildDashShieldedResult(OFFICIAL_FIXED_JSON.replace('"index":0', '"index":1'), options)).toThrow(/non-sequential/u);
  });
});
