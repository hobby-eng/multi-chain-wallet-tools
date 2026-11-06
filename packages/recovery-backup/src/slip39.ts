import { Slip39Passphrase } from "./slip39-passphrase.js";
import { defined } from "@ckd/core/defined.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { equalBytes } from "@ckd/core/bytes.js";
import { secureRandomBytes } from "@ckd/core/secure-random.js";
// Ported from Trezor's MIT-licensed python-shamir-mnemonic reference implementation.
// SLIP-0039 metadata layout and word order are interoperability-critical.
import { hmac } from "@noble/hashes/hmac.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { CheckedRandomByteSource } from "@ckd/core/random-byte-source.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { SLIP39_WORDLIST } from "./slip39-wordlist.js";

const RADIX_BITS = 10;
const RADIX = 1 << RADIX_BITS;
const ID_LENGTH_BITS = 15;
const EXTENDABLE_FLAG_LENGTH_BITS = 1;
const ITERATION_EXP_LENGTH_BITS = 4;
const ID_EXP_LENGTH_WORDS = 2;
const MAX_SHARE_COUNT = 16;
const CHECKSUM_LENGTH_WORDS = 3;
const DIGEST_LENGTH_BYTES = 4;
const CUSTOMIZATION_ORIGINAL = utf8ToBytes("shamir");
const CUSTOMIZATION_EXTENDABLE = utf8ToBytes("shamir_extendable");
const METADATA_LENGTH_WORDS = ID_EXP_LENGTH_WORDS + 2 + CHECKSUM_LENGTH_WORDS;
const MIN_STRENGTH_BITS = 128;
const MIN_MNEMONIC_LENGTH_WORDS = METADATA_LENGTH_WORDS + Math.ceil(MIN_STRENGTH_BITS / RADIX_BITS);
const BASE_ITERATION_COUNT = 10_000;
const ROUND_COUNT = 4;
const DEFAULT_ITERATION_EXPONENT = 1;
const ERRORS = new ErrorCatalog("wallet.slip39", {
  invalid: (message: string) => message,
  word: (position: number) => `Invalid SLIP-39 word at position ${position}.`,
  wiped: () => "This parsed SLIP-39 share has been released.",
});
const SECRET_INDEX = 255;
const DIGEST_INDEX = 254;

export interface Slip39GroupSpec {
  readonly memberThreshold: number;
  readonly memberCount: number;
}

export interface Slip39GenerateOptions {
  readonly groupThreshold: number;
  readonly groups: readonly Slip39GroupSpec[];
  readonly passphrase?: string;
  readonly extendable?: boolean;
  readonly iterationExponent?: number;
  readonly randomBytes?: (length: number) => Uint8Array;
}

export interface Slip39ShareInfo {
  readonly identifier: number;
  readonly extendable: boolean;
  readonly iterationExponent: number;
  readonly groupIndex: number;
  readonly groupThreshold: number;
  readonly groupCount: number;
  readonly memberIndex: number;
  readonly memberThreshold: number;
  readonly value: Uint8Array;
}

interface RawShare {
  readonly x: number;
  readonly data: Uint8Array;
}

const wordIndexes = new Map(SLIP39_WORDLIST.map((word, index) => [word, index]));
if (SLIP39_WORDLIST.length !== RADIX || wordIndexes.size !== RADIX) {
  throw new Error("The SLIP-39 wordlist must contain exactly 1024 unique words.");
}

function fail(message: string): never {
  throw ERRORS.create("invalid", [message]);
}

function assertSmallInteger(value: number, label: string, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
}

function defaultRandomBytes(length: number): Uint8Array {
  return secureRandomBytes(length);
}

function xor(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.length !== right.length) fail("SLIP-39 cipher halves must have equal lengths.");
  const output = new Uint8Array(left.length);
  for (let index = 0; index < output.length; index += 1)
    output[index] = defined(left[index]) ^ defined(right[index]);
  return output;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  // Reject excess padding before allocating bytes that no parsed owner could retire.
  if (value >> BigInt(length * 8) !== 0n) fail("Invalid mnemonic padding.");
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

function intToIndices(value: bigint, length: number, radixBits = RADIX_BITS): number[] {
  const mask = (1n << BigInt(radixBits)) - 1n;
  return Array.from({ length }, (_, offset) =>
    Number((value >> BigInt((length - offset - 1) * radixBits)) & mask),
  );
}

function indicesToBigInt(indices: readonly number[]): bigint {
  let value = 0n;
  for (const index of indices) value = value * BigInt(RADIX) + BigInt(index);
  return value;
}

const RS1024_GENERATORS = [
  0xe0e040, 0x1c1c080, 0x3838100, 0x7070200, 0xe0e0009, 0x1c0c2412, 0x38086c24, 0x3090fc48,
  0x21b1f890, 0x3f3f120,
] as const;

function polymod(values: Iterable<number>): number {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 20;
    checksum = ((checksum & 0xfffff) << 10) ^ value;
    for (let index = 0; index < 10; index += 1) {
      if (((top >>> index) & 1) !== 0) checksum ^= defined(RS1024_GENERATORS[index]);
    }
  }
  return checksum;
}

function checksum(data: readonly number[], customization: Uint8Array): number[] {
  const value = polymod([...customization, ...data, 0, 0, 0]) ^ 1;
  return [20, 10, 0].map((shift) => (value >>> shift) & 1023);
}

function customization(extendable: boolean): Uint8Array {
  return extendable ? CUSTOMIZATION_EXTENDABLE : CUSTOMIZATION_ORIGINAL;
}

function encodeShare(share: Slip39ShareInfo): string {
  const idExp =
    (share.identifier << (ITERATION_EXP_LENGTH_BITS + EXTENDABLE_FLAG_LENGTH_BITS)) |
    (Number(share.extendable) << ITERATION_EXP_LENGTH_BITS) |
    share.iterationExponent;
  let params = share.groupIndex;
  for (const value of [
    share.groupThreshold - 1,
    share.groupCount - 1,
    share.memberIndex,
    share.memberThreshold - 1,
  ]) {
    params = (params << 4) | value;
  }
  const valueWordCount = Math.ceil((share.value.length * 8) / RADIX_BITS);
  const data = [
    ...intToIndices(BigInt(idExp), ID_EXP_LENGTH_WORDS),
    ...intToIndices(BigInt(params), 2),
    ...intToIndices(bytesToBigInt(share.value), valueWordCount),
  ];
  return [...data, ...checksum(data, customization(share.extendable))]
    .map((index) => defined(SLIP39_WORDLIST[index]))
    .join(" ");
}

function parseShare(mnemonic: string): Slip39ShareInfo {
  const words = mnemonic.trim().toLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length < MIN_MNEMONIC_LENGTH_WORDS) {
    fail(
      `Invalid SLIP-39 mnemonic length; at least ${MIN_MNEMONIC_LENGTH_WORDS} words are required.`,
    );
  }
  const indices = words.map((word, place) => {
    const index = wordIndexes.get(word);
    if (index === undefined) throw ERRORS.create("word", [place + 1]);
    return index;
  });
  const paddingBits = (RADIX_BITS * (indices.length - METADATA_LENGTH_WORDS)) % 16;
  if (paddingBits > 8) fail("Invalid SLIP-39 mnemonic length.");
  const idExp = Number(indicesToBigInt(indices.slice(0, ID_EXP_LENGTH_WORDS)));
  const identifier = idExp >>> (EXTENDABLE_FLAG_LENGTH_BITS + ITERATION_EXP_LENGTH_BITS);
  const extendable = ((idExp >>> ITERATION_EXP_LENGTH_BITS) & 1) === 1;
  const iterationExponent = idExp & ((1 << ITERATION_EXP_LENGTH_BITS) - 1);
  if (polymod([...customization(extendable), ...indices]) !== 1)
    fail("Invalid SLIP-39 mnemonic checksum.");
  const params = intToIndices(
    indicesToBigInt(indices.slice(ID_EXP_LENGTH_WORDS, ID_EXP_LENGTH_WORDS + 2)),
    5,
    4,
  );
  const groupIndex = defined(params[0]);
  const rawGroupThreshold = defined(params[1]);
  const rawGroupCount = defined(params[2]);
  const memberIndex = defined(params[3]);
  const rawMemberThreshold = defined(params[4]);
  const groupThreshold = rawGroupThreshold + 1;
  const groupCount = rawGroupCount + 1;
  if (groupCount < groupThreshold) fail("SLIP-39 group threshold cannot exceed its group count.");
  const valueIndices = indices.slice(ID_EXP_LENGTH_WORDS + 2, -CHECKSUM_LENGTH_WORDS);
  const valueByteCount = Math.ceil((RADIX_BITS * valueIndices.length - paddingBits) / 8);
  const value = bigIntToBytes(indicesToBigInt(valueIndices), valueByteCount);
  return {
    identifier,
    extendable,
    iterationExponent,
    groupIndex,
    groupThreshold,
    groupCount,
    memberIndex,
    memberThreshold: rawMemberThreshold + 1,
    value,
  };
}

function precomputeGaloisTables(): { exp: Uint8Array; log: Uint8Array } {
  const exp = new Uint8Array(255);
  const log = new Uint8Array(256);
  let polynomial = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = polynomial;
    log[polynomial] = index;
    polynomial = (polynomial << 1) ^ polynomial;
    if ((polynomial & 0x100) !== 0) polynomial ^= 0x11b;
  }
  return { exp, log };
}

const { exp: EXP_TABLE, log: LOG_TABLE } = precomputeGaloisTables();

function interpolate(shares: readonly RawShare[], x: number): Uint8Array {
  const coordinates = new Set(shares.map((share) => share.x));
  if (coordinates.size !== shares.length) fail("SLIP-39 share indices must be unique.");
  const lengths = new Set(shares.map((share) => share.data.length));
  if (lengths.size !== 1) fail("SLIP-39 share values must have equal lengths.");
  const direct = shares.find((share) => share.x === x);
  if (direct !== undefined) return direct.data.slice();
  const length = shares[0]?.data.length ?? fail("At least one SLIP-39 share is required.");
  const logProduct = shares.reduce((sum, share) => sum + defined(LOG_TABLE[share.x ^ x]), 0);
  const result = new Uint8Array(length);
  for (const share of shares) {
    const denominator = shares.reduce(
      (sum, other) => sum + defined(LOG_TABLE[share.x ^ other.x]),
      0,
    );
    const basis = (logProduct - defined(LOG_TABLE[share.x ^ x]) - denominator) % 255;
    const normalizedBasis = basis < 0 ? basis + 255 : basis;
    for (let index = 0; index < length; index += 1) {
      const value = defined(share.data[index]);
      if (value !== 0)
        result[index] =
          defined(result[index]) ^
          defined(EXP_TABLE[(defined(LOG_TABLE[value]) + normalizedBasis) % 255]);
    }
  }
  return result;
}

function createDigest(randomPart: Uint8Array, secret: Uint8Array): Uint8Array {
  return hmac(sha256, randomPart, secret).slice(0, DIGEST_LENGTH_BYTES);
}

function splitSecret(
  threshold: number,
  shareCount: number,
  secret: Uint8Array,
  randomBytes: (length: number) => Uint8Array,
): RawShare[] {
  assertSmallInteger(threshold, "Threshold", 1, MAX_SHARE_COUNT);
  assertSmallInteger(shareCount, "Share count", threshold, MAX_SHARE_COUNT);
  if (threshold === 1)
    return Array.from({ length: shareCount }, (_, x) => ({ x, data: secret.slice() }));
  const shares: RawShare[] = [];
  let randomPart: Uint8Array | undefined;
  let digest: Uint8Array | undefined;
  let digestShare: Uint8Array | undefined;
  let completed = false;
  try {
    for (let x = 0; x < threshold - 2; x += 1) shares.push({ x, data: randomBytes(secret.length) });
    randomPart = randomBytes(secret.length - DIGEST_LENGTH_BYTES);
    digest = createDigest(randomPart, secret);
    digestShare = concatBytes(digest, randomPart);
    const baseShares = [
      ...shares,
      { x: DIGEST_INDEX, data: digestShare },
      { x: SECRET_INDEX, data: secret },
    ];
    for (let x = threshold - 2; x < shareCount; x += 1)
      shares.push({ x, data: interpolate(baseShares, x) });
    completed = true;
    return shares;
  } finally {
    randomPart?.fill(0);
    digest?.fill(0);
    digestShare?.fill(0);
    if (!completed) for (const share of shares) share.data.fill(0);
  }
}

function recoverSecret(threshold: number, shares: readonly RawShare[]): Uint8Array {
  if (shares.length < threshold) fail(`At least ${threshold} SLIP-39 shares are required.`);
  if (threshold === 1) return defined(shares[0]).data.slice();
  const selected = shares.slice(0, threshold);
  const secret = interpolate(selected, SECRET_INDEX);
  const digestShare = interpolate(selected, DIGEST_INDEX);
  const digest = digestShare.slice(0, DIGEST_LENGTH_BYTES);
  const randomPart = digestShare.slice(DIGEST_LENGTH_BYTES);
  const expected = createDigest(randomPart, secret);
  try {
    if (!equalBytes(digest, expected)) {
      secret.fill(0);
      fail("Invalid digest: these SLIP-39 shares do not reconstruct the same secret.");
    }
    return secret;
  } finally {
    digest.fill(0);
    randomPart.fill(0);
    digestShare.fill(0);
    expected.fill(0);
  }
}

function salt(identifier: number, extendable: boolean): Uint8Array {
  if (extendable) return new Uint8Array();
  return concatBytes(CUSTOMIZATION_ORIGINAL, Uint8Array.of(identifier >>> 8, identifier & 0xff));
}

function crypt(
  input: Uint8Array,
  passphrase: Uint8Array,
  iterationExponent: number,
  identifier: number,
  extendable: boolean,
  decrypt: boolean,
): Uint8Array {
  if (input.length % 2 !== 0)
    fail("The SLIP-39 master secret length must be an even number of bytes.");
  let left: Uint8Array = input.slice(0, input.length / 2);
  let right: Uint8Array = input.slice(input.length / 2);
  const roundSalt = salt(identifier, extendable);
  const rounds = Array.from({ length: ROUND_COUNT }, (_, index) =>
    decrypt ? ROUND_COUNT - index - 1 : index,
  );
  try {
    for (const round of rounds) {
      const password = concatBytes(Uint8Array.of(round), passphrase);
      const roundInput = concatBytes(roundSalt, right);
      let derived: Uint8Array | undefined;
      try {
        derived = pbkdf2(sha256, password, roundInput, {
          c: (BASE_ITERATION_COUNT << iterationExponent) / ROUND_COUNT,
          dkLen: right.length,
        });
        const previousLeft = left;
        const next = xor(previousLeft, derived);
        left = right;
        right = next;
        previousLeft.fill(0);
      } finally {
        password.fill(0);
        roundInput.fill(0);
        derived?.fill(0);
      }
    }
    return concatBytes(right, left);
  } finally {
    left.fill(0);
    right.fill(0);
    roundSalt.fill(0);
  }
}

function createShares(masterSecret: Uint8Array, options: Slip39GenerateOptions): string[][] {
  if (masterSecret.length * 8 < MIN_STRENGTH_BITS || masterSecret.length % 2 !== 0) {
    fail("SLIP-39 master secret must contain at least 128 bits and an even number of bytes.");
  }
  assertSmallInteger(options.groupThreshold, "Group threshold", 1, MAX_SHARE_COUNT);
  if (options.groups.length < options.groupThreshold || options.groups.length > MAX_SHARE_COUNT) {
    fail(`Group count must be from ${options.groupThreshold} to ${MAX_SHARE_COUNT}.`);
  }
  for (const group of options.groups) {
    assertSmallInteger(group.memberThreshold, "Member threshold", 1, MAX_SHARE_COUNT);
    assertSmallInteger(group.memberCount, "Member count", group.memberThreshold, MAX_SHARE_COUNT);
    if (group.memberThreshold === 1 && group.memberCount > 1) {
      fail("SLIP-39 does not permit multiple member shares with a 1-of-N member threshold.");
    }
  }
  const iterationExponent = options.iterationExponent ?? DEFAULT_ITERATION_EXPONENT;
  assertSmallInteger(iterationExponent, "Iteration exponent", 0, 15);
  const extendable = options.extendable ?? true;
  const source = new CheckedRandomByteSource(options.randomBytes ?? defaultRandomBytes);
  const randomBytes = (length: number): Uint8Array => source.bytes(length);
  const identifierBytes = randomBytes(2);
  const identifier =
    (((defined(identifierBytes[0]) << 8) | defined(identifierBytes[1])) &
      ((1 << ID_LENGTH_BITS) - 1)) >>>
    0;
  identifierBytes.fill(0);
  const passphrase = Slip39Passphrase.encode(options.passphrase ?? "");
  let encrypted: Uint8Array | undefined;
  let groupShares: RawShare[] = [];
  try {
    encrypted = crypt(masterSecret, passphrase, iterationExponent, identifier, extendable, false);
    groupShares = splitSecret(
      options.groupThreshold,
      options.groups.length,
      encrypted,
      randomBytes,
    );
    try {
      return options.groups.map((group, groupIndex) => {
        const memberShares = splitSecret(
          group.memberThreshold,
          group.memberCount,
          defined(groupShares[groupIndex]).data,
          randomBytes,
        );
        try {
          return memberShares.map((memberShare) =>
            encodeShare({
              identifier,
              extendable,
              iterationExponent,
              groupIndex,
              groupThreshold: options.groupThreshold,
              groupCount: options.groups.length,
              memberIndex: memberShare.x,
              memberThreshold: group.memberThreshold,
              value: memberShare.data,
            }),
          );
        } finally {
          for (const share of memberShares) share.data.fill(0);
        }
      });
    } finally {
      for (const share of groupShares) share.data.fill(0);
    }
  } finally {
    passphrase.fill(0);
    encrypted?.fill(0);
  }
}

function commonKey(share: Slip39ShareInfo): string {
  return [
    share.identifier,
    Number(share.extendable),
    share.iterationExponent,
    share.groupThreshold,
    share.groupCount,
  ].join(":");
}

/** Public cost of the admitted encrypted value; no secret bytes or KDF execution. */
export interface Slip39Work {
  readonly iterationExponent: number;
  readonly valueBytes: number;
  readonly rounds: number;
  readonly iterationsPerRound: number;
  /** Total PBKDF2 PRF iterations, including every output hash block. */
  readonly prfIterations: bigint;
  readonly requiresConfirmation: boolean;
}

/** Admits a whole set without its KDF, owns parsed/encrypted values and reports exact work. */
export class Slip39Recovery implements Disposable {
  readonly #parsed: Slip39Share[] = [];
  #encrypted: Uint8Array | undefined;
  readonly #first: Slip39Share;
  readonly #work: Slip39Work;

  /** Validates shares, thresholds and digest before any passphrase stretching. */
  constructor(mnemonics: readonly string[]) {
    let admitted = false;
    using _rollback = {
      [Symbol.dispose]: () => {
        if (!admitted) this.wipe();
      },
    };
    if (mnemonics.length === 0) fail("Enter at least one SLIP-39 share.");
    for (const mnemonic of mnemonics) this.#parsed.push(Slip39.parse(mnemonic));
    if (new Set(this.#parsed.map(commonKey)).size !== 1)
      fail("The supplied SLIP-39 shares belong to different sets.");
    this.#first = defined(this.#parsed[0]);
    const groups = new Map<number, Slip39Share[]>();
    for (const share of this.#parsed) {
      const group = groups.get(share.groupIndex) ?? [];
      if (group.some((candidate) => candidate.memberIndex === share.memberIndex)) continue;
      if (group.some((candidate) => candidate.memberThreshold !== share.memberThreshold))
        fail("SLIP-39 shares in one group declare different member thresholds.");
      group.push(share);
      groups.set(share.groupIndex, group);
    }
    const complete = [...groups.entries()].filter(
      ([, group]) => group.length >= defined(group[0]).memberThreshold,
    );
    if (complete.length < this.#first.groupThreshold)
      fail(`At least ${this.#first.groupThreshold} complete SLIP-39 groups are required.`);
    const groupShares: RawShare[] = [];
    try {
      for (const [x, group] of complete.slice(0, this.#first.groupThreshold))
        groupShares.push({
          x,
          data: recoverSecret(
            defined(group[0]).memberThreshold,
            group.map((share) => ({ x: share.memberIndex, data: share.value })),
          ),
        });
      this.#encrypted = recoverSecret(this.#first.groupThreshold, groupShares);
    } finally {
      for (const share of groupShares) share.data.fill(0);
    }
    const iterationsPerRound =
      (BASE_ITERATION_COUNT * 2 ** this.#first.iterationExponent) / ROUND_COUNT;
    const blocks = Math.ceil(this.#encrypted.length / 2 / sha256.outputLen);
    const prfIterations = BigInt(iterationsPerRound) * BigInt(ROUND_COUNT) * BigInt(blocks);
    this.#work = Object.freeze({
      iterationExponent: this.#first.iterationExponent,
      valueBytes: this.#encrypted.length,
      rounds: ROUND_COUNT,
      iterationsPerRound,
      prfIterations,
      requiresConfirmation:
        prfIterations > BigInt(BASE_ITERATION_COUNT * 2 ** DEFAULT_ITERATION_EXPONENT),
    });
    admitted = true;
  }

  /** Harmless metadata remains readable after disposal; it never contains a share or phrase. */
  get work(): Slip39Work {
    return this.#work;
  }

  /** Borrows a transient passphrase and returns independently owned plaintext entropy. */
  recover(passphraseInput = ""): Uint8Array {
    if (this.#encrypted === undefined) throw ERRORS.create("wiped", []);
    const passphrase = Slip39Passphrase.encode(passphraseInput);
    try {
      return crypt(
        this.#encrypted,
        passphrase,
        this.#first.iterationExponent,
        this.#first.identifier,
        this.#first.extendable,
        true,
      );
    } finally {
      passphrase.fill(0);
    }
  }

  /** Releases every admitted share and the combined encrypted value; future recovery refuses. */
  wipe(): void {
    this.#encrypted?.fill(0);
    this.#encrypted = undefined;
    for (const share of this.#parsed) share.wipe();
    this.#parsed.length = 0;
  }
  /** Ends admission/recovery ownership. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** An independently owned parsed share; public metadata survives, secret value reads end at wipe. */
export class Slip39Share implements Slip39ShareInfo, Disposable {
  readonly #info: Slip39ShareInfo;
  #wiped = false;

  /** Consumes transient mnemonic text and takes ownership of the parser's mutable value bytes. */
  constructor(mnemonic: string) {
    this.#info = Object.freeze(parseShare(mnemonic));
  }
  /** Public SLIP39 set identifier. */
  get identifier(): number {
    return this.#info.identifier;
  }
  /** Whether the share uses the extendable customization. */
  get extendable(): boolean {
    return this.#info.extendable;
  }
  /** The admitted four-bit iteration exponent. */
  get iterationExponent(): number {
    return this.#info.iterationExponent;
  }
  /** Zero-based group index. */
  get groupIndex(): number {
    return this.#info.groupIndex;
  }
  /** Number of complete groups required. */
  get groupThreshold(): number {
    return this.#info.groupThreshold;
  }
  /** Total number of groups in the set. */
  get groupCount(): number {
    return this.#info.groupCount;
  }
  /** Zero-based member index. */
  get memberIndex(): number {
    return this.#info.memberIndex;
  }
  /** Number of members required within this group. */
  get memberThreshold(): number {
    return this.#info.memberThreshold;
  }
  /** Borrows mutable encrypted-share bytes while live; callers must not retain or mutate them. */
  get value(): Uint8Array {
    if (this.#wiped) throw ERRORS.create("wiped", []);
    return this.#info.value;
  }
  /** Clears this owner's bytes as far as the runtime allows and revokes secret reads. */
  wipe(): void {
    this.#wiped = true;
    this.#info.value.fill(0);
  }
  /** Ends the parsed value's lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** The host-neutral SLIP39 operations and their fixed generation limits. */
export class Slip39 {
  /** Generation defaults, shared by front ends instead of repeating protocol limits. */
  static parameters(): { maximumShares: number; defaultIterationExponent: number } {
    return { maximumShares: MAX_SHARE_COUNT, defaultIterationExponent: DEFAULT_ITERATION_EXPONENT };
  }
  /** Parses one share into a disposable owner; coded refusals never echo an unknown word. */
  static parse(this: void, mnemonic: string): Slip39Share {
    return new Slip39Share(mnemonic);
  }
  /** Creates grouped shares; borrows entropy/randomness and returns caller-owned text views. */
  static create(this: void, masterSecret: Uint8Array, options: Slip39GenerateOptions): string[][] {
    return createShares(masterSecret, options);
  }
  /** Admits a set and exposes public cost without running its KDF; caller disposes the plan. */
  static prepare(mnemonics: readonly string[]): Slip39Recovery {
    return new Slip39Recovery(mnemonics);
  }
  /** Recovers caller-owned entropy; always disposes parsed shares and temporary KDF inputs. */
  static recover(this: void, mnemonics: readonly string[], passphrase = ""): Uint8Array {
    using plan = Slip39.prepare(mnemonics);
    return plan.recover(passphrase);
  }
}

/** Compatibility entry; use Slip39.parse and dispose the returned owner after borrowing value. */
export const parseSlip39Share = Slip39.parse;
/** Compatibility entry for the same single generation implementation. */
export const createSlip39Shares = Slip39.create;
/** Compatibility entry; the caller must wipe returned entropy after use. */
export const recoverSlip39Shares = Slip39.recover;
