import { equalBytes } from '@ckd/core/bytes.js';
import { secureRandomBytes } from '@ckd/core/secure-random.js';
import { base64urlnopad } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/hashes/utils.js';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import {
  initSync as initShamir,
  recover_shamir_secret as recoverShamirWasm,
  split_shamir_shares as splitShamirWasm,
} from '@ckd/recovery-shamir-wasm/recovery_shamir_wasm.js';
import shamirWasmBytes from '@ckd/recovery-shamir-wasm/recovery_shamir_wasm_bg.wasm';

const MAGIC = Uint8Array.of(0x43, 0x4b, 0x44, 0x53);
const VERSION = 2;
const LEGACY_VERSION = 1;
const SET_ID_BYTES = 8;
const SECRET_DIGEST_BYTES = 16;
const BASE_HEADER_BYTES = MAGIC.length + 4 + SET_ID_BYTES;
const HEADER_BYTES = BASE_HEADER_BYTES + SECRET_DIGEST_BYTES;
const CHECKSUM_BYTES = 4;
const LEGACY_RAW_PREFIX = 'ckd-shamir-v1:';
const LEGACY_WORD_PREFIX = 'ckd-shamir-words-v1:';
let initialized = false;

export type CkdShamirShareFormat = 'raw' | 'words';

export interface CkdShamirShareSet {
  readonly threshold: number;
  readonly count: number;
  readonly secretLength: number;
  readonly shares: readonly string[];
}

export interface CkdShamirRecovery {
  readonly secret: Uint8Array;
  readonly version: 1 | 2;
  readonly integrity: 'legacy-checksum-only' | 'share-set-digest';
}

interface DecodedShare {
  readonly version: number;
  readonly threshold: number;
  readonly count: number;
  readonly secretLength: number;
  readonly setId: Uint8Array;
  readonly secretDigest?: Uint8Array;
  readonly serialized: Uint8Array;
}

function initialize(): void {
  if (initialized) return;
  initShamir({ module: shamirWasmBytes });
  initialized = true;
}

function assertByteInteger(value: number, label: string, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}

function envelope(
  serialized: Uint8Array,
  threshold: number,
  count: number,
  secretLength: number,
  setId: Uint8Array,
  secretDigest: Uint8Array,
): Uint8Array {
  const body = concatBytes(
    MAGIC,
    Uint8Array.of(VERSION, threshold, count, secretLength),
    setId,
    secretDigest,
    serialized,
  );
  const digest = sha256(body).slice(0, CHECKSUM_BYTES);
  try {
    return concatBytes(body, digest);
  } finally {
    digest.fill(0);
  }
}

function bytesToWords(bytes: Uint8Array): string {
  let accumulator = 0;
  let bits = 0;
  const words: string[] = [];
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 11) {
      bits -= 11;
      words.push(wordlist[(accumulator >>> bits) & 0x7ff]!);
      accumulator &= (1 << bits) - 1;
    }
  }
  if (bits > 0) words.push(wordlist[(accumulator << (11 - bits)) & 0x7ff]!);
  return words.join(' ');
}

const wordIndexes = new Map(wordlist.map((word, index) => [word, index]));

function wordsToBytes(value: string): Uint8Array {
  const normalized = value.trim().toLowerCase();
  // Format identification and versioning live in the checksummed binary
  // envelope. Accept the former visible marker only for old backup cards.
  const encoded = normalized.startsWith(LEGACY_WORD_PREFIX)
    ? normalized.slice(LEGACY_WORD_PREFIX.length).trim()
    : normalized;
  const words = encoded.split(/\s+/u).filter(Boolean);
  if (words.length === 0) throw new Error('Word share has no encoded words.');
  let accumulator = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const word of words) {
    const index = wordIndexes.get(word);
    if (index === undefined) throw new Error(`Unknown BIP39 encoding word: ${word}.`);
    accumulator = accumulator * 2048 + index;
    bits += 11;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 0xff);
      accumulator &= (1 << bits) - 1;
    }
  }
  if (accumulator !== 0) throw new Error('Word share has non-zero trailing padding bits.');
  return Uint8Array.from(bytes);
}

function parseEnvelope(bytes: Uint8Array): DecodedShare {
  if (bytes.length < BASE_HEADER_BYTES + 17 + CHECKSUM_BYTES) throw new Error('Shamir share is too short.');
  const version = bytes[MAGIC.length]!;
  if (!equalBytes(bytes.slice(0, MAGIC.length), MAGIC) || (version !== LEGACY_VERSION && version !== VERSION)) {
    throw new Error('Unsupported Shamir share format or version.');
  }
  const headerBytes = version === VERSION ? HEADER_BYTES : BASE_HEADER_BYTES;
  const threshold = bytes[5]!;
  const count = bytes[6]!;
  const secretLength = bytes[7]!;
  assertByteInteger(threshold, 'Share threshold', 2, 255);
  assertByteInteger(count, 'Share count', threshold, 255);
  if (![16, 20, 24, 28, 32].includes(secretLength)) throw new Error('Shamir share declares an invalid secret length.');
  const expectedLength = headerBytes + secretLength + 1 + CHECKSUM_BYTES;
  if (bytes.length < expectedLength) throw new Error('Shamir share is truncated.');
  if (bytes.length > expectedLength && bytes.slice(expectedLength).some((byte) => byte !== 0)) {
    throw new Error('Shamir share contains unexpected trailing data.');
  }
  const exact = bytes.slice(0, expectedLength);
  const body = exact.slice(0, -CHECKSUM_BYTES);
  const expected = sha256(body).slice(0, CHECKSUM_BYTES);
  const actual = exact.slice(-CHECKSUM_BYTES);
  try {
    if (!equalBytes(actual, expected)) throw new Error('Shamir share checksum is invalid.');
  } finally {
    expected.fill(0);
  }
  return {
    version,
    threshold,
    count,
    secretLength,
    setId: exact.slice(8, 8 + SET_ID_BYTES),
    ...(version === VERSION
      ? { secretDigest: exact.slice(BASE_HEADER_BYTES, BASE_HEADER_BYTES + SECRET_DIGEST_BYTES) }
      : {}),
    serialized: exact.slice(headerBytes, -CHECKSUM_BYTES),
  };
}

function decodeShare(value: string, format: CkdShamirShareFormat): DecodedShare {
  const normalized = value.trim();
  const bytes =
    format === 'raw'
      ? base64urlnopad.decode(
          (normalized.toLowerCase().startsWith(LEGACY_RAW_PREFIX)
            ? normalized.slice(LEGACY_RAW_PREFIX.length)
            : normalized
          ).replace(/=+$/u, ''),
        )
      : wordsToBytes(normalized);
  try {
    return parseEnvelope(bytes);
  } finally {
    bytes.fill(0);
  }
}

function encodeShare(bytes: Uint8Array, format: CkdShamirShareFormat): string {
  return format === 'raw' ? base64urlnopad.encode(bytes) : bytesToWords(bytes);
}

export function createCkdShamirShares(
  secret: Uint8Array,
  threshold: number,
  count: number,
  format: CkdShamirShareFormat,
): CkdShamirShareSet {
  if (format !== 'raw' && format !== 'words')
    throw new Error(`Unsupported CKD Shamir share format: ${String(format)}.`);
  assertByteInteger(threshold, 'Share threshold', 2, 255);
  assertByteInteger(count, 'Share count', threshold, 255);
  if (![16, 20, 24, 28, 32].includes(secret.length)) throw new Error('Enter a valid BIP39 recovery phrase.');
  const randomSeed = secureRandomBytes(32);
  let setId: Uint8Array | undefined;
  let secretDigest: Uint8Array | undefined;
  let packed: Uint8Array | undefined;
  try {
    // Begin the cleanup scope immediately after the first secret-adjacent
    // allocation. Later randomness, hashing, WASM initialization and splitting
    // may all throw independently and must not bypass wiping earlier buffers.
    const createdSetId = secureRandomBytes(SET_ID_BYTES);
    setId = createdSetId;
    const createdSecretDigest = sha256(secret).slice(0, SECRET_DIGEST_BYTES);
    secretDigest = createdSecretDigest;
    initialize();
    packed = splitShamirWasm(secret, threshold, count, randomSeed);
    const shareLength = secret.length + 1;
    const shares = Array.from({ length: count }, (_, index) => {
      const wrapped = envelope(
        packed!.slice(index * shareLength, (index + 1) * shareLength),
        threshold,
        count,
        secret.length,
        createdSetId,
        createdSecretDigest,
      );
      try {
        return encodeShare(wrapped, format);
      } finally {
        wrapped.fill(0);
      }
    });
    return { threshold, count, secretLength: secret.length, shares };
  } finally {
    randomSeed.fill(0);
    packed?.fill(0);
    setId?.fill(0);
    secretDigest?.fill(0);
  }
}

export function recoverCkdShamirSharesDetailed(
  values: readonly string[],
  format: CkdShamirShareFormat,
): CkdShamirRecovery {
  if (format !== 'raw' && format !== 'words')
    throw new Error(`Unsupported CKD Shamir share format: ${String(format)}.`);
  if (values.length === 0) throw new Error('Enter at least one Shamir share.');
  const shares: DecodedShare[] = [];
  try {
    for (const value of values) shares.push(decodeShare(value, format));
    const first = shares[0]!;
    for (const share of shares.slice(1)) {
      if (
        share.version !== first.version ||
        share.threshold !== first.threshold ||
        share.count !== first.count ||
        share.secretLength !== first.secretLength ||
        !equalBytes(share.setId, first.setId) ||
        (first.secretDigest !== undefined &&
          (share.secretDigest === undefined || !equalBytes(share.secretDigest, first.secretDigest)))
      ) {
        throw new Error('The supplied Shamir shares belong to different sets.');
      }
    }
    const unique = new Set(shares.map((share) => share.serialized[0]));
    if (unique.size !== shares.length) throw new Error('The same Shamir share was entered more than once.');
    if (shares.length < first.threshold)
      throw new Error(`At least ${first.threshold} shares from this set are required.`);
    const packed = concatBytes(...shares.map((share) => share.serialized));
    try {
      initialize();
      let recovered: Uint8Array;
      try {
        recovered = recoverShamirWasm(packed, first.secretLength + 1, first.threshold);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`Shamir restoration failed: ${detail}`);
      }
      if (first.secretDigest !== undefined) {
        const digest = sha256(recovered).slice(0, SECRET_DIGEST_BYTES);
        try {
          if (!equalBytes(digest, first.secretDigest)) {
            recovered.fill(0);
            throw new Error('Recovered Shamir secret does not match the share-set digest.');
          }
        } finally {
          digest.fill(0);
        }
      }
      return {
        secret: recovered,
        version: first.version as 1 | 2,
        integrity: first.secretDigest === undefined ? 'legacy-checksum-only' : 'share-set-digest',
      };
    } finally {
      packed.fill(0);
    }
  } finally {
    for (const share of shares) {
      share.setId.fill(0);
      share.secretDigest?.fill(0);
      share.serialized.fill(0);
    }
  }
}

export function recoverCkdShamirShares(values: readonly string[], format: CkdShamirShareFormat): Uint8Array {
  return recoverCkdShamirSharesDetailed(values, format).secret;
}
