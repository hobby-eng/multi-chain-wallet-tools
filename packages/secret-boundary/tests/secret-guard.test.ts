import { describe, expect, it } from 'vitest';
import { SecretEgressGuard, disposeSecretBytes } from '../src/secret-guard.js';

describe('SecretEgressGuard', () => {
  it('blocks raw, compacted, percent-decoded and base64-encoded secret material', () => {
    const guard = new SecretEgressGuard();
    guard.registerString('mnemonic', 'alpha beta gamma delta');
    expect(() => guard.assertPublic({ value: 'alpha beta gamma delta' }, 'request')).toThrow(/mnemonic/u);
    expect(() => guard.assertPublic({ value: 'alphabetagammadelta' }, 'request')).toThrow(/mnemonic/u);
    expect(() => guard.assertPublic({ value: 'alpha%20beta%20gamma%20delta' }, 'request')).toThrow(/mnemonic/u);
    expect(() => guard.assertPublic({ value: btoa('alpha beta gamma delta') }, 'request')).toThrow(/mnemonic/u);
  });

  it('clears registered values and wipes disposable byte buffers', () => {
    const guard = new SecretEgressGuard();
    const secret = new Uint8Array([1, 2, 3, 4]);
    guard.registerBytes('seed', secret);
    expect(() => guard.assertPublic({ value: '01020304' }, 'request')).toThrow(/seed/u);
    guard.clear();
    expect(() => guard.assertPublic({ value: '01020304' }, 'request')).not.toThrow();
    disposeSecretBytes(secret);
    expect([...secret]).toEqual([0, 0, 0, 0]);
  });
});
