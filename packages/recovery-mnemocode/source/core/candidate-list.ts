// The candidate list (docs/CANDIDATES.md, "The list"): BIP39 entropies with optional passphrases,
// in the order of the search, padded with Padmé so that its size tells little, and the limit of
// records one list holds (TooManyForListError). Any search can fill one: it knows nothing of dates
// or shares, and of words only that a record's entropy is an English BIP39 phrase
// (OpenedCandidateList).
//
// It needs nothing from the host. It does not encrypt, which is a separate layer
// (candidate-encryption.ts): a reader decrypts first and opens the plain bytes here. It reads or
// writes no file. Host-neutral, with @scure/bip39 (test/portable-modules.test.ts).

import { BIP39_ENTROPY_BYTES } from "./bip39-sizes.js";
import { CRC32_BYTES, crc32 } from "../sskr/checksum.js";
import { counting } from "./search-plan.js";
import { entropyToMnemonic } from "@scure/bip39";
import { englishWordlist } from "./english-words.js";
import { Redacted } from "./redacted.js";
import { equalBytes } from "./bits.js";
import { assertCandidateFileSize } from "./candidate-file-refusal.js";
import { defined } from "./defined.js";
import { ErrorCatalog } from "./error-catalog.js";
import { ByteArray } from "./byte-array.js";

const ERRORS = new ErrorCatalog("core.candidate-list", {
  "candidate-list-wiped": () => "This candidate list has been wiped.",
  "padm-length-2-more": () => "Padmé needs a length of 2 or more.",
  "not-valid-unicode-text": (value0: string) => `The ${value0} is not valid Unicode text.`,
  "longer-than-bytes": (value0: string, value1: string) =>
    `The ${value0} is longer than ${value1} bytes.`,
  "candidate-list-holds-1-records": (value0: string) =>
    `A candidate list holds 1 to ${value0} records.`,
  "every-candidate-bip39-entropy-one-length-16-32": () =>
    "Every candidate must be BIP39 entropy of one length, 16 to 32 bytes.",
  "candidate-list-cut-short": () => "The candidate list is cut short.",
  "passphrase-candidate-list-wrong-length": () =>
    "A passphrase in the candidate list has a wrong length.",
  "passphrase-candidate-list-not-valid-utf-8-text": () =>
    "A passphrase in the candidate list is not valid UTF-8 text.",
  "not-mnemo-code-candidate-list": () => "This is not a MnemoCode candidate list.",
  "candidate-list-version-not-supported": (value0: string) =>
    `Candidate list version ${value0} is not supported.`,
  "candidate-list-unknown-flags": () => "The candidate list has unknown flags.",
  "candidate-list-wrong-entropy-length": () => "The candidate list has a wrong entropy length.",
  "candidate-list-wrong-record-count": () => "The candidate list has a wrong record count.",
  "candidate-list-damaged-crc-32-does-not-match": () =>
    "The candidate list is damaged: its CRC-32 does not match.",
  "candidate-list-wrong-padding": () => "The candidate list has wrong padding.",
});

/** "MNCL": MnemoCode candidate list. */
const MAGIC = [0x4d, 0x4e, 0x43, 0x4c] as const;
const VERSION = 1;
const GLOBAL_PASSPHRASE_FLAG = 0b01;
const RECORD_PASSPHRASE_FLAG = 0b10;
/**
 * Records in one list, 2^19. Two forgotten words of a 12-word phrase give 2048 × 2048 / 16 =
 * 262,144 checksum-valid phrases on average, and up to some thousand more when neither is the
 * last word; twice that leaves room to spare.
 */
export const MAX_CANDIDATE_RECORDS = 2 ** 19;
/** The longest BIP39 passphrase that a record of a list holds, in bytes of UTF-8. */
export const MAX_PASSPHRASE_BYTES = 256;

/**
 * Candidates a search keeps for a list: one more than a list holds, so that it can tell that they
 * are too many (candidateListHolds).
 */
export const LIST_KEEP = MAX_CANDIDATE_RECORDS + 1;

/** Whether one list holds `count` candidates. */
export function candidateListHolds(count: number): boolean {
  return count <= MAX_CANDIDATE_RECORDS;
}

/** BIP39 entropy: 16 to 32 bytes for 12 to 24 words. */
const ENTROPY_LENGTHS: ReadonlySet<number> = new Set(BIP39_ENTROPY_BYTES);
/** Magic, version, flags, entropy length and the 4-byte count. */
const HEADER_BYTES = 11;
const LENGTH_BYTES = 2;
const COUNT_BYTES = 4;
const CRC_BYTES = CRC32_BYTES;

/**
 * Thrown when a search finds, or surely will find, more candidates than one list holds, so that a
 * host can tell this refusal from the others and offer what still works: narrowing the search, or
 * a wallet check without a list. `advice` says how the search that found them is narrowed, such as
 * "give more of the words, or a few letters of them".
 */
export class TooManyForListError extends Error {
  readonly code: CandidateListErrorCode = "too-many-for-list";

  constructor(advice: string) {
    super(
      `More than ${counting(MAX_CANDIDATE_RECORDS)} candidates, more than one list holds: ${advice}.`,
    );
    this.name = "TooManyForListError";
  }
}

/** The code of the refusal of more candidates than one list holds, this module's only error. */
export type CandidateListErrorCode = "too-many-for-list";

/**
 * One candidate of a list: the entropy of a seed phrase and, where it has one, its own BIP39
 * passphrase.
 */
export interface CandidateRecord {
  /** Byte data, also at runtime: Uint8Array, including Buffer and subarray views. */
  readonly entropy: Uint8Array;
  /** The record's own BIP39 passphrase; without it, the list's. */
  readonly passphrase?: string;
}

/** A list of candidate seed phrases, as it is written to a file and read back. */
export interface CandidateList {
  /**
   * The BIP39 passphrase of every record without one of its own. An empty one is no passphrase:
   * it is written as none, so a writer passes the BIP39 passphrase as it is.
   */
  readonly passphrase?: string;
  readonly records: readonly CandidateRecord[];
}

/**
 * The padded length of `length` bytes (Padmé: Nikitin et al., PETS 2019): with E the bit length of
 * the length less one and S that of E, the low E − S bits are rounded up; at most about 12 % more.
 */
export function padmeLength(length: number): number {
  if (!Number.isSafeInteger(length) || length < 2) throw ERRORS.create("padm-length-2-more", []);
  const floorLog2 = (value: number) => {
    let bits = 0;
    while (2 ** (bits + 1) <= value) bits += 1;
    return bits;
  };
  const e = floorLog2(length);
  const step = 2 ** (e - (floorLog2(e) + 1));
  return Math.ceil(length / step) * step;
}

/** Largest MNCL v1 list: both passphrase fields, maximum entropy and records, CRC, then Padmé. */
export const MAX_CANDIDATE_LIST_BYTES = padmeLength(
  HEADER_BYTES +
    LENGTH_BYTES +
    MAX_PASSPHRASE_BYTES +
    MAX_CANDIDATE_RECORDS *
      (Math.max(...BIP39_ENTROPY_BYTES) + LENGTH_BYTES + MAX_PASSPHRASE_BYTES) +
    CRC_BYTES,
);

const encoder = new TextEncoder();

/**
 * Refuses a passphrase that no list can hold: one with a lone surrogate, which UTF-8 cannot carry,
 * or one longer than MAX_PASSPHRASE_BYTES. Callers check a BIP39 passphrase before a long search.
 */
export function assertListPassphrase(passphrase: string, what = "BIP39 passphrase"): void {
  if (/\p{Cs}/u.test(passphrase)) throw ERRORS.create("not-valid-unicode-text", [`${what}`]);
  if (utf8Length(passphrase) > MAX_PASSPHRASE_BYTES)
    throw ERRORS.create("longer-than-bytes", [`${what}`, `${MAX_PASSPHRASE_BYTES}`]);
}

/** The highest code points written in UTF-8 with one, two and three bytes (RFC 3629). */
const UTF8_LIMITS = [0x7f, 0x7ff, 0xffff] as const;

/**
 * The UTF-8 length of `text`, which has no lone surrogate, counted without encoding it: a copy of
 * a passphrase made only to measure it would be one more secret to wipe (AUD-012-SEC003).
 */
function utf8Length(text: string): number {
  let length = 0;
  for (const character of text) {
    const point = defined(character.codePointAt(0));
    length += 1 + UTF8_LIMITS.filter((limit) => point > limit).length;
  }
  return length;
}

/** A passphrase as stored; an empty one is no passphrase. */
function passphraseBytes(passphrase: string | undefined, what: string): Uint8Array | undefined {
  if (passphrase === undefined || passphrase === "") return undefined;
  assertListPassphrase(passphrase, what);
  return encoder.encode(passphrase);
}

/** Writes a list; every record must have the same entropy length. */
export function encodeCandidateList(list: CandidateList): Uint8Array {
  // Array.from turns holes into undefined, which is refused below: some(), map() and forEach()
  // would skip them, and the header would count records that the list does not hold.
  const records = Array.from(list.records);
  const count = records.length;
  if (count < 1 || count > MAX_CANDIDATE_RECORDS)
    throw ERRORS.create("candidate-list-holds-1-records", [`${counting(MAX_CANDIDATE_RECORDS)}`]);
  // Read each host field once: a getter must not supply bytes to validation and another value
  // to serialization. Own the admitted bytes before passphrase getters can change their source.
  const entropies = records.map((record) => record?.entropy);
  const lengths = entropies.map((bytes) => ByteArray.length(bytes));
  const entropyLength = lengths[0];
  if (
    entropyLength === undefined ||
    !ENTROPY_LENGTHS.has(entropyLength) ||
    // TypedArray.set would silently narrow a wider array or coerce ordinary array elements.
    lengths.some((length) => length !== entropyLength)
  )
    throw ERRORS.create("every-candidate-bip39-entropy-one-length-16-32", []);
  // The passphrases as bytes are this function's own: copied into the list, then wiped, also when a
  // later one is refused.
  const owned: Uint8Array[] = [];
  const bytesOf = (passphrase: string | undefined, what: string) => {
    const bytes = passphraseBytes(passphrase, what);
    if (bytes !== undefined) owned.push(bytes);
    return bytes;
  };
  try {
    const copies = entropies.map((bytes) => {
      const copy = new Uint8Array(bytes);
      owned.push(copy);
      return copy;
    });
    return listBytes(copies, defined(copies[0]).byteLength, count, {
      global: bytesOf(list.passphrase, "passphrase for all candidates"),
      own: records.map((record, index) =>
        bytesOf(record.passphrase, `passphrase of candidate ${index + 1}`),
      ),
    });
  } finally {
    for (const bytes of owned) bytes.fill(0);
  }
}

/** The bytes of a checked list: its header, passphrases and records, the CRC and the padding. */
function listBytes(
  entropies: readonly Uint8Array[],
  entropyLength: number,
  count: number,
  passphrases: {
    readonly global: Uint8Array | undefined;
    readonly own: readonly (Uint8Array | undefined)[];
  },
): Uint8Array {
  const { global, own } = passphrases;
  const perRecord = own.some((bytes) => bytes !== undefined);
  const parts: Uint8Array[] = [];
  const header = new Uint8Array(HEADER_BYTES);
  header.set(MAGIC);
  header[4] = VERSION;
  header[5] = (global ? GLOBAL_PASSPHRASE_FLAG : 0) | (perRecord ? RECORD_PASSPHRASE_FLAG : 0);
  header[6] = entropyLength;
  new DataView(header.buffer).setUint32(HEADER_BYTES - COUNT_BYTES, count);
  parts.push(header);
  const field = (bytes: Uint8Array) => {
    const length = new Uint8Array(LENGTH_BYTES);
    new DataView(length.buffer).setUint16(0, bytes.length);
    parts.push(length, bytes);
  };
  if (global) field(global);
  entropies.forEach((entropy, index) => {
    parts.push(entropy);
    if (perRecord) field(own[index] ?? new Uint8Array());
  });
  const contentLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(padmeLength(contentLength + CRC_BYTES));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  new DataView(output.buffer).setUint32(offset, crc32(output.subarray(0, offset)));
  return output;
}

/** Reads a list, refusing it as a whole when anything in it is out of place. */
export function decodeCandidateList(bytes: Uint8Array): CandidateList {
  OpenedCandidateList.assertSize(bytes.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // ignoreBOM: a passphrase is kept as stored, with a leading U+FEFF if it has one.
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let offset = 0;
  const take = (length: number): Uint8Array => {
    if (offset + length > bytes.length) throw ERRORS.create("candidate-list-cut-short", []);
    offset += length;
    return bytes.subarray(offset - length, offset);
  };
  const uint16 = (): number => {
    take(LENGTH_BYTES);
    return view.getUint16(offset - LENGTH_BYTES);
  };
  const uint32 = (): number => {
    take(COUNT_BYTES);
    return view.getUint32(offset - COUNT_BYTES);
  };
  /** A passphrase field; undefined when it is empty. */
  const passphrase = (minimum: number): string | undefined => {
    const length = uint16();
    if (length < minimum || length > MAX_PASSPHRASE_BYTES)
      throw ERRORS.create("passphrase-candidate-list-wrong-length", []);
    if (length === 0) return undefined;
    try {
      return decoder.decode(take(length));
    } catch {
      throw ERRORS.create("passphrase-candidate-list-not-valid-utf-8-text", []);
    }
  };
  const magic = take(MAGIC.length);
  if (!equalBytes(magic, MAGIC)) throw ERRORS.create("not-mnemo-code-candidate-list", []);
  const [version, flags, entropyLength] = take(3);
  if (version !== VERSION)
    throw ERRORS.create("candidate-list-version-not-supported", [`${version}`]);
  if ((defined(flags) & ~(GLOBAL_PASSPHRASE_FLAG | RECORD_PASSPHRASE_FLAG)) !== 0)
    throw ERRORS.create("candidate-list-unknown-flags", []);
  if (!ENTROPY_LENGTHS.has(defined(entropyLength)))
    throw ERRORS.create("candidate-list-wrong-entropy-length", []);
  const count = uint32();
  if (count < 1 || count > MAX_CANDIDATE_RECORDS)
    throw ERRORS.create("candidate-list-wrong-record-count", []);
  const global = defined(flags) & GLOBAL_PASSPHRASE_FLAG ? passphrase(1) : undefined;
  const records: CandidateRecord[] = [];
  try {
    for (let index = 0; index < count; index += 1) {
      const entropy = Uint8Array.from(take(defined(entropyLength)));
      records.push({ entropy });
      const own = defined(flags) & RECORD_PASSPHRASE_FLAG ? passphrase(0) : undefined;
      if (own !== undefined) records[index] = { entropy, passphrase: own };
    }
    const contentLength = offset;
    if (uint32() !== crc32(bytes.subarray(0, contentLength)))
      throw ERRORS.create("candidate-list-damaged-crc-32-does-not-match", []);
    if (bytes.length !== padmeLength(offset) || bytes.subarray(offset).some((byte) => byte !== 0))
      throw ERRORS.create("candidate-list-wrong-padding", []);
  } catch (error) {
    // A list refused as a whole gives nothing back: the entropy copied so far is wiped.
    for (const record of records) record.entropy.fill(0);
    throw error;
  }
  return global === undefined ? { records } : { passphrase: global, records };
}

/** Where the BIP39 passphrases of an opened list come from: none, one for all, or the records. */
export type ListPassphrases = "none" | "list" | "records";

/**
 * One candidate of an opened list: its seed phrase, and the BIP39 passphrase it is checked with.
 */
export interface ListCandidate {
  readonly phrase: string;
  readonly passphrase: string;
}

/**
 * A candidate list opened from its decrypted bytes (decodeCandidateList). A class, because it owns
 * the entropy of every record until it is wiped, and answers what the rules of the format make of
 * them: each candidate's phrase and its BIP39 passphrase. Its text shows no record.
 */
export class OpenedCandidateList extends Redacted {
  /** The same admission rule for a plaintext file, encryption input, or decrypted output. */
  static assertSize(size: number): void {
    assertCandidateFileSize(size, MAX_CANDIDATE_LIST_BYTES, "plaintext candidate list");
  }

  #records: readonly { readonly entropy: Uint8Array; readonly passphrase?: Uint8Array }[];
  readonly #count: number;
  readonly #passphrases: ListPassphrases;
  #wiped = false;
  /** The UTF-8 passphrase for records without one of their own; empty bytes for none. */
  readonly #passphrase: Uint8Array;

  private constructor(list: CandidateList) {
    super("OpenedCandidateList");
    this.#records = list.records.map(({ entropy, passphrase }) => ({
      entropy,
      ...(passphrase === undefined ? {} : { passphrase: encoder.encode(passphrase) }),
    }));
    this.#passphrase = encoder.encode(list.passphrase ?? "");
    this.#count = this.#records.length;
    this.#passphrases = this.#records.some((record) => record.passphrase !== undefined)
      ? "records"
      : this.#passphrase.length === 0
        ? "none"
        : "list";
  }

  /** The list in `plain`, its decrypted bytes, which are wiped once read, also when refused. */
  static fromBytes(plain: Uint8Array): OpenedCandidateList {
    try {
      return new OpenedCandidateList(decodeCandidateList(plain));
    } finally {
      plain.fill(0);
    }
  }

  /** How many candidates the list holds. */
  get count(): number {
    return this.#count;
  }

  /** Where the passphrases come from: any record's own, else one for all, else none. */
  get passphrases(): ListPassphrases {
    return this.#passphrases;
  }

  /** The candidates in the order of the list, candidate N as N; made fresh each time. */
  candidates(): ListCandidate[] {
    if (this.#wiped) throw ERRORS.create("candidate-list-wiped", []);
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    const passphrase = decoder.decode(this.#passphrase);
    return this.#records.map((record) => ({
      phrase: entropyToMnemonic(record.entropy, englishWordlist),
      passphrase: record.passphrase === undefined ? passphrase : decoder.decode(record.passphrase),
    }));
  }

  /** Wipes owned entropy/passphrase bytes and ends candidate access; count/flags remain metadata. */
  wipe(): void {
    for (const record of this.#records) {
      record.entropy.fill(0);
      record.passphrase?.fill(0);
    }
    this.#passphrase.fill(0);
    this.#records = [];
    this.#wiped = true;
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}
