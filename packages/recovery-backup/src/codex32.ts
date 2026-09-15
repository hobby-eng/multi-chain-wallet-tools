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

function codex32Failure(action: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const threshold = /ThresholdNotPassed\s*\{\s*threshold:\s*(\d+),\s*n_shares:\s*(\d+)/u.exec(detail);
  if (threshold !== null) {
    return new Error(
      `${action}: ${threshold[1]} distinct compatible shares are required; ${threshold[2]} were supplied.`,
    );
  }
  if (/RepeatedIndex/u.test(detail)) return new Error(`${action}: the same Codex32 share index was supplied twice.`);
  if (/MismatchedId/u.test(detail)) return new Error(`${action}: the Codex32 records use different identifiers.`);
  if (/MismatchedHrp/u.test(detail)) return new Error(`${action}: the Codex32 records use incompatible prefixes.`);
  if (/InvalidChecksum/u.test(detail)) return new Error(`${action}: a Codex32 record has an invalid checksum.`);
  return new Error(`${action}: ${detail}`);
}

function callCodex32<T>(action: string, operation: () => T): T {
  try {
    return operation();
  } catch (cause) {
    throw codex32Failure(action, cause);
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
    return {
      identifier,
      threshold,
      shares: [callCodex32('Codex32 encoding failed', () => encodeSeedWasm(masterSeed, 0, identifier, 's'))],
    };
  }
  validateInteger(threshold, 'Codex32 threshold', 2, 9);
  validateInteger(count, 'Codex32 share count', threshold, SHARE_INDICES.length);

  const basis = [callCodex32('Codex32 encoding failed', () => encodeSeedWasm(masterSeed, threshold, identifier, 's'))];
  let random: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  try {
    for (let index = 0; index < threshold - 1; index += 1) {
      random.fill(0);
      random = secureRandomBytes(masterSeed.length);
      basis.push(
        callCodex32('Codex32 encoding failed', () =>
          encodeSeedWasm(random, threshold, identifier, SHARE_INDICES[index]!),
        ),
      );
    }
    const basisText = basis.join('\n');
    const shares = SHARE_INDICES.slice(0, count).map((index) =>
      callCodex32('Codex32 share creation failed', () => interpolateWasm(basisText, index)),
    );
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
    shares.length === 1 && shares[0]!.toLowerCase()[8] === 's'
      ? shares[0]!
      : callCodex32('Codex32 restoration failed', () => interpolateWasm(shares.join('\n'), 's'));
  const seed = callCodex32('Codex32 decoding failed', () => decodeSeedWasm(master));
  try {
    validateSeedLength(seed);
    return seed.slice();
  } finally {
    seed.fill(0);
  }
}
