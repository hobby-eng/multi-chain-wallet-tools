import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@ckd/recovery-envelope-wasm/recovery_envelope_wasm_bg.wasm', async () => ({
  default: readFileSync(
    new URL('../../recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm', import.meta.url),
  ),
}));

import {
  createGordianSeedEnvelope,
  createProtectedGordianSeedEnvelope,
  deriveGordianRecipientKeys,
  recoverGordianSeedEnvelope,
  recoverProtectedGordianSeedEnvelope,
  recoverProtectedGordianSeedEnvelopeBundle,
} from '../src/gordian-envelope.js';

const entropy = Uint8Array.from({ length: 16 }, (_, index) => index);

describe('Gordian Seed Envelope', () => {
  it('round-trips a typed unencrypted Seed Envelope', () => {
    const record = createGordianSeedEnvelope(entropy, 'Backup', 'offline');
    expect(record.startsWith('ur:envelope/')).toBe(true);
    expect(recoverGordianSeedEnvelope(record)).toEqual(entropy);
  });

  it('restores encrypted entropy and its included BIP39 passphrase', () => {
    const records = createProtectedGordianSeedEnvelope(entropy, '', '', {
      password: 'container password',
      bip39Passphrase: 'wallet passphrase',
    });
    expect(recoverProtectedGordianSeedEnvelopeBundle(records, 'container password')).toEqual({
      entropy,
      bip39Passphrase: 'wallet passphrase',
    });
    expect(() => createProtectedGordianSeedEnvelope(entropy, '', '', { bip39Passphrase: 'unprotected' })).toThrow(
      'requires password, recipient, or SSKR protection',
    );
  });

  it('restores an SSKR-protected Envelope from a valid one-of-one permit', () => {
    const records = createProtectedGordianSeedEnvelope(entropy, '', '', {
      sskrGroupThreshold: 1,
      sskrGroups: [{ threshold: 1, count: 1 }],
    });
    expect(records).toHaveLength(1);
    expect(recoverProtectedGordianSeedEnvelope(records)).toEqual(entropy);
  });

  it('opens one encrypted content key through password, either recipient, or an SSKR quorum', () => {
    const owner = deriveGordianRecipientKeys(new Uint8Array(64).fill(7));
    const backupRecipient = deriveGordianRecipientKeys(new Uint8Array(64).fill(8));
    const records = createProtectedGordianSeedEnvelope(entropy, '', '', {
      password: 'correct horse',
      recipientPublicKeys: [owner.publicKey, backupRecipient.publicKey],
      sskrGroupThreshold: 1,
      sskrGroups: [{ threshold: 2, count: 3 }],
    });
    expect(records).toHaveLength(3);
    expect(recoverProtectedGordianSeedEnvelope([records[0]!], 'correct horse')).toEqual(entropy);
    expect(recoverProtectedGordianSeedEnvelope([records[0]!], '', owner.privateKey)).toEqual(entropy);
    expect(recoverProtectedGordianSeedEnvelope([records[1]!], '', backupRecipient.privateKey)).toEqual(entropy);
    expect(recoverProtectedGordianSeedEnvelope([records[0]!, records[2]!])).toEqual(entropy);
    expect(() => recoverProtectedGordianSeedEnvelope([records[0]!], 'wrong')).toThrow();
    expect(() => recoverProtectedGordianSeedEnvelope([records[0]!])).toThrow();
  });
});
