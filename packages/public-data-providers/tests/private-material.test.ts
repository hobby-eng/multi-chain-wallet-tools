import { describe, expect, it } from 'vitest';
import {
  assertPublicBatchLookupInput,
  assertPublicLookupInput,
  PrivateMaterialError,
} from '../src/private-material.js';

describe('public-input private-material boundary', () => {
  it.each([
    '0x' + '11'.repeat(32),
    'xprv9s21ZrQH143K3QTDL4J7vG4hXr7hQeK1M8k1xH8pK5Q6Y6sXQ5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q',
    'xprv9s21ZrQH143K3example',
    '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----',
    'private key: secret',
  ])('rejects secret-looking public input and exposes the cleanup error', (value) => {
    expect(() => assertPublicLookupInput(value)).toThrow(PrivateMaterialError);
    expect(() => assertPublicLookupInput(value)).toThrow(/erased|No network request/iu);
  });

  it('rejects a valid mnemonic embedded in a multiline batch', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    expect(() => assertPublicBatchLookupInput(`public-value\n${mnemonic}\nother-public-value`)).toThrow(
      PrivateMaterialError,
    );
  });

  it('accepts public values and rejects empty input explicitly', () => {
    expect(() => assertPublicBatchLookupInput('1BoatSLRHtKNngkdXEeobR76b53LETtpyT\nDashIdentityName')).not.toThrow();
    expect(() => assertPublicLookupInput('   ')).toThrow(/Enter a public/iu);
  });
});
