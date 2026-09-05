import { describe, expect, it } from 'vitest';
import { field, paymentAddressField } from '@ckd/core/types.js';
import { paymentQrMatrix, paymentQrPayload } from '../src/ui/payment-qr.js';

describe('payment QR payloads', () => {
  it.each([
    ['bitcoin', 'bitcoin:Xaddress'],
    ['ethereum', 'ethereum:Xaddress'],
    ['dash', 'dash:Xaddress'],
    [undefined, 'Xaddress'],
  ] as const)('maps the %s scheme to its reviewed payload', (scheme, expected) => {
    expect(paymentQrPayload(paymentAddressField('address', 'Address', 'Xaddress', scheme))).toBe(expected);
  });

  it.each([
    field('privateKey', 'Private key', 'secret', true),
    field('publicKey', 'Public key', 'public'),
    field('path', 'Path', "m/44'/5'"),
    field('identityId', 'Identity ID', 'identity'),
    field('address', 'Unclassified address-like metadata', 'Xaddress'),
  ])('refuses non-payment field $key', (candidate) => {
    expect(paymentQrPayload(candidate)).toBeUndefined();
  });

  it('produces a stable square boolean matrix with a quiet zone', () => {
    const matrix = paymentQrMatrix('dash:Xaddress');
    expect(matrix).toHaveLength(29);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    expect(matrix.flat().every((module) => typeof module === 'boolean')).toBe(true);
    expect(matrix.slice(0, 4).flat().every((module) => !module)).toBe(true);
    expect(matrix.flat().filter(Boolean)).toHaveLength(226);
  });
});
