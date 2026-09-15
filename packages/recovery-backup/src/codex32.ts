import { secureRandomBytes } from '@ckd/core/secure-random.js';
import {
  decode_codex32_seed as decodeSeedWasm,
  encode_codex32_seed as encodeSeedWasm,
  initSync as initCodex32,
  interpolate_codex32 as interpolateWasm,
} from '@ckd/recovery-codex32-wasm/recovery_codex32_wasm.js';
import codex32WasmBytes from '@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm';

const SHARE_INDICES = 'acdefghjklmnpqrtuvwxyz023456789'.split('');
const IDENTIFIER = /^[023456789acdefghjklmnpqrstuvwxyz]{4}$/u;
let initialized = false;

export interface Codex32Backup {
  readonly identifier: string;
  readonly threshold: number;
  readonly shares: readonly string[];
}

function initialize(): void {
  if (initialized) return;
  initCodex32({ module: codex32WasmBytes });
  initialized = true;
}

function validateSeedLength(seed: Uint8Array): void {
  if (![16, 20, 24, 28, 32, 64].includes(seed.length)) {
    throw new Error('Codex32 supports 16, 20, 24, 28, 32, or 64 bytes of secret data.');
  }
}

function validateIdentifier(value: string): string {
  const identifier = value.trim().toLowerCase();
  if (!IDENTIFIER.test(identifier)) {
    throw new Error('Codex32 identifier must contain exactly four lowercase Bech32 characters.');
  }
  return identifier;
}

function validateInteger(value: number, label: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}

export function createCodex32Backup(
  masterSeed: Uint8Array,
  identifierInput: string,
  threshold: number,
  count: number,
): Codex32Backup {
  validateSeedLength(masterSeed);
  const identifier = validateIdentifier(identifierInput);
  initialize();
  if (threshold === 0) {
    if (count !== 1) throw new Error('An unsplit Codex32 secret creates exactly one record.');
    return { identifier, threshold, shares: [encodeSeedWasm(masterSeed, 0, identifier, 's')] };
  }
  validateInteger(threshold, 'Codex32 threshold', 2, 9);
  validateInteger(count, 'Codex32 share count', threshold, SHARE_INDICES.length);

  const basis = [encodeSeedWasm(masterSeed, threshold, identifier, 's')];
  let random: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  try {
    for (let index = 0; index < threshold - 1; index += 1) {
      random.fill(0);
      random = secureRandomBytes(masterSeed.length);
      basis.push(encodeSeedWasm(random, threshold, identifier, SHARE_INDICES[index]!));
    }
    const basisText = basis.join('\n');
    const shares = SHARE_INDICES.slice(0, count).map((index) => interpolateWasm(basisText, index));
    return { identifier, threshold, shares };
  } finally {
    random.fill(0);
    basis.fill('');
  }
}

export function recoverCodex32Seed(values: readonly string[]): Uint8Array {
  const shares = values.map((value) => value.trim()).filter(Boolean);
  if (shares.length === 0) throw new Error('Enter at least one Codex32 secret or share.');
  initialize();
  const master =
    shares.length === 1 && shares[0]!.toLowerCase()[8] === 's' ? shares[0]! : interpolateWasm(shares.join('\n'), 's');
  const seed = decodeSeedWasm(master);
  try {
    validateSeedLength(seed);
    return seed.slice();
  } finally {
    seed.fill(0);
  }
}
