import { describe, expect, it } from 'vitest';
import { assertWatchOnlyBatchInput, assertWatchOnlyMinimum, parseWatchOnlyLines } from '../src/watch-only.js';
import { detectBitcoinWatchOnly } from '../src/watch-only/bitcoin.js';
import { detectDashWatchOnly } from '../src/watch-only/dash.js';

const PUBLIC_KEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('shared watch-only boundary', () => {
  it('parses batches and rejects private material before detection', () => {
    expect(parseWatchOnlyLines('public-key: ' + PUBLIC_KEY + '\n\n')).toEqual(['public-key: ' + PUBLIC_KEY]);
    expect(() => assertWatchOnlyBatchInput('ab'.repeat(32))).toThrow();
  });

  it('keeps the address minimum bounded to the BIP32 index range', () => {
    expect(() => assertWatchOnlyMinimum(0)).toThrow();
    expect(() => assertWatchOnlyMinimum(1)).not.toThrow();
  });

  it('detects the same public SEC1 key for Bitcoin and Dash only when explicitly selected', () => {
    expect(detectBitcoinWatchOnly('public-key: ' + PUBLIC_KEY, { auto: false })).toMatchObject({
      coinId: 'bitcoin',
      kind: 'public-key',
      value: PUBLIC_KEY,
    });
    expect(detectDashWatchOnly('public-key: ' + PUBLIC_KEY, { auto: false })).toMatchObject({
      coinId: 'dash',
      kind: 'public-key',
      value: PUBLIC_KEY,
    });
    expect(() => detectBitcoinWatchOnly(PUBLIC_KEY, { auto: true })).toThrow();
    expect(() => detectDashWatchOnly(PUBLIC_KEY, { auto: true })).toThrow();
  });
});
