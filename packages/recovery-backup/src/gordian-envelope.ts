import {
  create_seed_envelope,
  create_seed_envelope_advanced,
  derive_seed_recipient_keys,
  initSync,
  recover_seed_envelope,
  recover_seed_envelope_advanced,
  recover_seed_envelope_bundle_advanced,
} from '@ckd/recovery-envelope-wasm/recovery_envelope_wasm.js';
import wasmBytes from '@ckd/recovery-envelope-wasm/recovery_envelope_wasm_bg.wasm';
import { validateSskrGroups, type SskrGroupSpec } from './sskr-groups.js';

let initialized = false;
function initializeEnvelopeWasm(): void {
  if (initialized) return;
  initSync({ module: wasmBytes });
  initialized = true;
}
interface GordianRecipientKeys {
  readonly privateKey: string;
  readonly publicKey: string;
}
export function createGordianSeedEnvelope(entropy: Uint8Array, name = '', note = '', password = ''): string {
  initializeEnvelopeWasm();
  return create_seed_envelope(entropy, name, note, password);
}
export function recoverGordianSeedEnvelope(record: string, password = ''): Uint8Array {
  initializeEnvelopeWasm();
  return recover_seed_envelope(record, password);
}
export function deriveGordianRecipientKeys(bip39Seed: Uint8Array): GordianRecipientKeys {
  initializeEnvelopeWasm();
  return JSON.parse(derive_seed_recipient_keys(bip39Seed)) as GordianRecipientKeys;
}

interface GordianProtection {
  readonly password?: string;
  readonly bip39Passphrase?: string | undefined;
  readonly recipientPublicKeys?: readonly string[];
  readonly sskrGroupThreshold?: number | undefined;
  readonly sskrGroups?: readonly SskrGroupSpec[];
}
export function createProtectedGordianSeedEnvelope(
  entropy: Uint8Array,
  name: string,
  note: string,
  options: GordianProtection,
): string[] {
  initializeEnvelopeWasm();
  const groups = options.sskrGroups ?? [];
  const packedGroups = validateSskrGroups(options.sskrGroupThreshold, groups, {
    label: 'Envelope SSKR',
    allowEmpty: true,
  });
  return create_seed_envelope_advanced(
    entropy,
    name,
    note,
    options.password ?? '',
    options.bip39Passphrase ?? '',
    (options.recipientPublicKeys ?? []).join('\n'),
    options.sskrGroupThreshold ?? 0,
    packedGroups,
  ).split('\n');
}
export function recoverProtectedGordianSeedEnvelope(
  records: readonly string[],
  password = '',
  recipientPrivateKey = '',
): Uint8Array {
  initializeEnvelopeWasm();
  return recover_seed_envelope_advanced(records.join('\n'), password, recipientPrivateKey);
}

interface RecoveredGordianSeedBundle {
  readonly entropy: Uint8Array;
  readonly bip39Passphrase?: string | undefined;
}

export function recoverProtectedGordianSeedEnvelopeBundle(
  records: readonly string[],
  password = '',
  recipientPrivateKey = '',
): RecoveredGordianSeedBundle {
  initializeEnvelopeWasm();
  const parsed = JSON.parse(
    recover_seed_envelope_bundle_advanced(records.join('\n'), password, recipientPrivateKey),
  ) as { entropy: number[]; bip39Passphrase: string | null };
  return {
    entropy: Uint8Array.from(parsed.entropy),
    ...(parsed.bip39Passphrase === null ? {} : { bip39Passphrase: parsed.bip39Passphrase }),
  };
}
