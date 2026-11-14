// Zcash's shielded Sapling keys: ZIP-32's hierarchy (https://zips.z.cash/zip-0032, Final;
// zcash/zips @8c456b6 zips/zip-0032.rst) over the key components of the Zcash protocol
// specification (https://zips.z.cash/protocol/protocol.pdf; zcash/zips @d0e2420
// protocol/protocol.tex, whose sections are named below by their titles). A seed of 32 to 252
// bytes (the BIP39 seed of a phrase) gives the master key; hardened children give an account's key
// at m_Sapling/32'/133'/account'; diversifiers come from FF1-AES256 over the 88-bit index j, and an
// index whose diversifier does not hash to a point has no address (about half of them). Internal
// (change) keys and ZIP-32's non-hardened children are not derived: a receiving account needs
// neither. It runs on the pinned Noble curves (Jubjub and its group hash), hashes (BLAKE2b,
// BLAKE2s) and ciphers (FF1). Every key and every working copy this module makes is wiped when its
// work ends, and a wiped key refuses further use; erasure goes only as far as the runtime allows:
// the BigInt scalars and coordinates, and the hex strings and byte copies that Noble makes inside
// its conversions (bytesToNumberLE, numberToBytesLE) and point decoding, cannot be wiped. It also
// checks the Sapling items of ZIP-316's unified encodings (coins/zcash/unified.ts).
import type { EdwardsPoint } from "@noble/curves/abstract/edwards.js";
import { jubjub, jubjub_findGroupHash, jubjub_groupHash } from "@noble/curves/misc.js";
import { bytesToNumberLE, equalBytes, numberToBytesLE } from "@noble/curves/utils.js";
import { BinaryFF1 } from "@noble/ciphers/ff1.js";
import { blake2b, blake2s } from "@noble/hashes/blake2.js";
import { assertIndex, BIP32_HARDENED_OFFSET, MAX_BIP32_DEPTH } from "@ckd/core/bip32-limits.js";
import { concatBytes, wipe } from "@ckd/core/crypto.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

/** The bytes of a scalar's and a point's encoding, of ovk, dk and a chain code. */
const PART_BYTES = 32;
/** A diversifier: 88 bits (ZIP-32 "Sapling diversifier derivation"). */
export const SAPLING_DIVERSIFIER_BYTES = 11;
/** A raw payment address, d ‖ pk_d ("Sapling Payment Addresses"). */
export const SAPLING_ADDRESS_BYTES = SAPLING_DIVERSIFIER_BYTES + PART_BYTES;
/** ZIP-316's Sapling FVK Encoding, ak ‖ nk ‖ ovk ‖ dk, and its IVK Encoding, dk ‖ ivk. */
const FULL_VIEWING_KEY_ENCODING_BYTES = 4 * PART_BYTES;
const INCOMING_VIEWING_KEY_ENCODING_BYTES = 2 * PART_BYTES;
/** The bytes of an expanded spending key ask ‖ nsk ‖ ovk, and of a full viewing key ak ‖ nk ‖ ovk. */
const EXPANDED_KEY_BYTES = 3 * PART_BYTES;
/** The bytes of ZIP-32's FVK tag: a child's encoding holds them from its parent's fingerprint. */
const TAG_BYTES = 4;
/** The bytes of a child number in ZIP-32's encodings, little-endian. */
const CHILD_NUMBER_BYTES = 4;
/** ZIP-32 "Wallet seeds": a seed "MUST be at least 32 and at most 252 bytes". */
const SEED_MIN_BYTES = 32;
const SEED_MAX_BYTES = 252;

/** The highest diversifier index, 2^88 − 1 (ZIP-32 "Sapling diversifier derivation"). */
export const SAPLING_MAX_DIVERSIFIER_INDEX = 2n ** 88n - 1n;

/** r_J, the order of Jubjub's prime-order subgroup, which ask and nsk are reduced by ("Jubjub"). */
const SUBGROUP_ORDER = jubjub.Point.Fn.ORDER;
/** CRH^ivk keeps the low 251 bits of its BLAKE2s digest, 3 bits of the top byte ("CRH^ivk"). */
const IVK_TOP_BYTE_MASK = 0b0000_0111;

const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
/** BLAKE2b personalizations: ZIP-32's master key, PRF^expand, the FVK fingerprint. */
const MASTER_PERSONALIZATION = ascii("ZcashIP32Sapling");
const EXPAND_PERSONALIZATION = ascii("Zcash_ExpandSeed");
const FINGERPRINT_PERSONALIZATION = ascii("ZcashSaplingFVFP");
/** BLAKE2s personalizations: CRH^ivk, DiversifyHash^Sapling, and the group hashes of G and H. */
const IVK_PERSONALIZATION = ascii("Zcashivk");
const DIVERSIFY_PERSONALIZATION = ascii("Zcash_gd");
const SPEND_AUTH_PERSONALIZATION = ascii("Zcash_G_");
const PROOF_GENERATION_PERSONALIZATION = ascii("Zcash_H_");

/** The first byte of each PRF^expand input: the spec's ("Sapling Key Components") and ZIP-32's. */
const DOMAIN = Object.freeze({
  ask: 0x00,
  nsk: 0x01,
  ovk: 0x02,
  dk: 0x10,
  hardenedChild: 0x11,
  childAsk: 0x13,
  childNsk: 0x14,
  childOvk: 0x15,
  childDk: 0x16,
});

const ERRORS = new ErrorCatalog("sapling.key", {
  seed: {
    kind: "range",
    text: () =>
      `A Sapling master key comes from a seed of ${SEED_MIN_BYTES} to ${SEED_MAX_BYTES} bytes (ZIP-32).`,
  },
  "spending-key": {
    kind: "range",
    text: () => `A Sapling spending key has ${PART_BYTES} bytes.`,
  },
  "expanded-key": {
    kind: "range",
    text: () =>
      `An expanded Sapling spending key has ${EXPANDED_KEY_BYTES} bytes, ask and nsk each below the order of Jubjub's prime-order subgroup.`,
  },
  invalid: {
    kind: "range",
    text: () => "This Sapling key is invalid: its ask or its ivk is zero (ZIP-32).",
  },
  depth: {
    kind: "range",
    text: () => `A Sapling key is at most ${MAX_BIP32_DEPTH} levels below its master.`,
  },
  "diversifier-index": {
    kind: "range",
    text: () => "A Sapling diversifier index is an integer from 0 to 2^88 − 1.",
  },
  count: {
    kind: "range",
    text: () => "The number of diversifier indexes to try is a whole number from 1 up.",
  },
  diversifier: {
    kind: "range",
    text: () =>
      `A Sapling diversifier has ${SAPLING_DIVERSIFIER_BYTES} bytes that hash to a point of Jubjub's prime-order subgroup.`,
  },
  wiped: () => "This Sapling key has been wiped.",
});

/**
 * G and H of Sapling, the bases of ak and nk ("Spend Authorization Signature", "Sapling Key
 * Components"), computed once, when first needed.
 */
let generators: {
  readonly spendAuth: EdwardsPoint;
  readonly proofGeneration: EdwardsPoint;
} | null = null;

function saplingGenerators(): NonNullable<typeof generators> {
  const empty = new Uint8Array(0);
  generators ??= Object.freeze({
    spendAuth: jubjub_findGroupHash(empty, SPEND_AUTH_PERSONALIZATION),
    proofGeneration: jubjub_findGroupHash(empty, PROOF_GENERATION_PERSONALIZATION),
  });
  return generators;
}

/**
 * PRF^expand(key, [domain] ‖ parts) = BLAKE2b-512("Zcash_ExpandSeed", key ‖ [domain] ‖ parts)
 * ("Pseudo Random Functions"). It builds and wipes the one message; the caller wipes the digest.
 */
function prfExpand(key: Uint8Array, domain: number, ...parts: Uint8Array[]): Uint8Array {
  const message = concatBytes(key, Uint8Array.of(domain), ...parts);
  try {
    return blake2b(message, { dkLen: 2 * PART_BYTES, personalization: EXPAND_PERSONALIZATION });
  } finally {
    wipe(message);
  }
}

/** ToScalar(PRF^expand(key, [domain])): the 512-bit digest modulo r_J ("Sapling Key Components"). */
function expandToScalar(key: Uint8Array, domain: number): bigint {
  const digest = prfExpand(key, domain);
  try {
    return bytesToNumberLE(digest) % SUBGROUP_ORDER;
  } finally {
    wipe(digest);
  }
}

/** The first 32 bytes of PRF^expand, as ovk and dk take them; the caller wipes them. */
function expandTruncated(key: Uint8Array, domain: number, ...parts: Uint8Array[]): Uint8Array {
  const digest = prfExpand(key, domain, ...parts);
  try {
    return digest.slice(0, PART_BYTES);
  } finally {
    wipe(digest);
  }
}

/** Writes `scalar` as 32 little-endian bytes into `target` at `offset`, wiping Noble's copy. */
function writeScalar(target: Uint8Array, offset: number, scalar: bigint): void {
  const bytes = numberToBytesLE(scalar, PART_BYTES);
  try {
    target.set(bytes, offset);
  } finally {
    wipe(bytes);
  }
}

/**
 * DiversifyHash^Sapling(d): the group hash "Zcash_gd" of d ("Group Hash into Jubjub"), or null
 * (⊥) when the hash is not the encoding of a point or the point times Jubjub's cofactor is the
 * identity. Those are the only failures of Noble's group hash for an 11-byte input and an 8-byte
 * personalization, so its error is that outcome.
 */
function diversifyHash(diversifier: Uint8Array): EdwardsPoint | null {
  try {
    return jubjub_groupHash(diversifier, DIVERSIFY_PERSONALIZATION);
  } catch {
    return null;
  }
}

/** pk_d = [ivk] base, encoded. The ivk of a valid key lies between 1 and 2^251 − 1. */
function transmissionKeyOf(ivk: Uint8Array, base: EdwardsPoint): Uint8Array {
  return base.multiply(bytesToNumberLE(ivk)).toBytes();
}

/**
 * The point that `encoding` encodes when it is a canonical encoding of a point of Jubjub's
 * prime-order subgroup ("Jubjub": abst_J, canonical, torsion-free); null otherwise. Noble's strict
 * decoding (without the ZIP-215 option) refuses both ⊥ and the non-canonical encodings.
 */
function primeOrderPoint(encoding: Uint8Array): EdwardsPoint | null {
  try {
    const point = jubjub.Point.fromBytes(encoding);
    return point.isTorsionFree() ? point : null;
  } catch {
    return null;
  }
}

/**
 * Whether `bytes` are a valid raw Sapling payment address ("Sapling Payment Addresses"): 43 bytes,
 * pk_d a canonical encoding of a point of the prime-order subgroup other than the identity, and a
 * diversifier d that hashes to a point, which sapling-crypto's PaymentAddress::from_bytes also
 * requires (zcash/sapling-crypto @793e090 src/address.rs L58-72).
 */
export function isSaplingAddressEncoding(bytes: Uint8Array): boolean {
  if (bytes.length !== SAPLING_ADDRESS_BYTES) return false;
  const transmissionKey = primeOrderPoint(bytes.subarray(SAPLING_DIVERSIFIER_BYTES));
  return (
    transmissionKey !== null &&
    !transmissionKey.is0() &&
    diversifyHash(bytes.subarray(0, SAPLING_DIVERSIFIER_BYTES)) !== null
  );
}

/**
 * Whether `bytes` are a valid Sapling FVK Encoding of ZIP-316, EncodeExtFVKParts(ak, nk, ovk, dk):
 * 128 bytes, ak a point of the prime-order subgroup other than the identity and nk a point of the
 * subgroup ("Sapling Full Viewing Keys"); ovk and dk may be any bytes.
 */
export function isSaplingFullViewingKeyEncoding(bytes: Uint8Array): boolean {
  if (bytes.length !== FULL_VIEWING_KEY_ENCODING_BYTES) return false;
  const ak = primeOrderPoint(bytes.subarray(0, PART_BYTES));
  return (
    ak !== null && !ak.is0() && primeOrderPoint(bytes.subarray(PART_BYTES, 2 * PART_BYTES)) !== null
  );
}

/**
 * Whether `bytes` are a valid Sapling IVK Encoding of ZIP-316, dk ‖ I2LEOSP_256(ivk): 64 bytes,
 * ivk from 1 to 2^251 − 1 ("Sapling Incoming Viewing Keys"; ZIP-316: "a zero ivk is not valid").
 */
export function isSaplingIncomingViewingKeyEncoding(bytes: Uint8Array): boolean {
  if (bytes.length !== INCOMING_VIEWING_KEY_ENCODING_BYTES) return false;
  const ivk = bytes.subarray(PART_BYTES);
  return ((ivk[PART_BYTES - 1] ?? 0) & ~IVK_TOP_BYTE_MASK) === 0 && ivk.some((byte) => byte !== 0);
}

/**
 * The key components of one Sapling spending key ("Sapling Key Components"): the expanded spending
 * key ask, nsk and ovk, and what it gives, the full viewing key ak, nk and ovk and the incoming
 * viewing key ivk. ZIP-32's extended keys (SaplingExtendedSpendingKey) hold one. A key whose ask or
 * ivk is zero is refused, as ZIP-32 makes such keys invalid.
 */
export class SaplingExpandedSpendingKey implements Disposable {
  /** ask ‖ nsk ‖ ovk, each scalar as 32 little-endian bytes. */
  readonly #expanded: Uint8Array;
  /** ak ‖ nk ‖ ovk, the points as Jubjub's encoding repr_J. */
  readonly #viewing: Uint8Array;
  /** ivk as 32 little-endian bytes. */
  readonly #ivk: Uint8Array;
  #wiped = false;

  /** Takes ownership of all three. */
  private constructor(expanded: Uint8Array, viewing: Uint8Array, ivk: Uint8Array) {
    this.#expanded = expanded;
    this.#viewing = viewing;
    this.#ivk = ivk;
  }

  /**
   * The key components of a 32-byte spending key sk: ask and nsk are PRF^expand(sk, [0])
   * and PRF^expand(sk, [1]) modulo r_J, ovk the first 32 bytes of PRF^expand(sk, [2]). The caller
   * wipes its sk. Refuses (sapling.key.spending-key) another length, and (sapling.key.invalid) a
   * key whose ask or ivk is zero.
   */
  static fromSpendingKey(spendingKey: Uint8Array): SaplingExpandedSpendingKey {
    if (spendingKey.length !== PART_BYTES) throw ERRORS.create("spending-key", []);
    const ovk = expandTruncated(spendingKey, DOMAIN.ovk);
    try {
      return SaplingExpandedSpendingKey.#fromParts(
        expandToScalar(spendingKey, DOMAIN.ask),
        expandToScalar(spendingKey, DOMAIN.nsk),
        ovk,
      );
    } finally {
      wipe(ovk);
    }
  }

  /**
   * The key of the 96 bytes ask ‖ nsk ‖ ovk that bytes() gives, which are copied: the caller wipes
   * its own. Refuses (sapling.key.expanded-key) another length or a scalar from r_J on, which
   * would be a second encoding of a smaller one, and (sapling.key.invalid) an ask or ivk of zero.
   */
  static fromBytes(bytes: Uint8Array): SaplingExpandedSpendingKey {
    if (bytes.length !== EXPANDED_KEY_BYTES) throw ERRORS.create("expanded-key", []);
    const ask = bytesToNumberLE(bytes.subarray(0, PART_BYTES));
    const nsk = bytesToNumberLE(bytes.subarray(PART_BYTES, 2 * PART_BYTES));
    if (ask >= SUBGROUP_ORDER || nsk >= SUBGROUP_ORDER) throw ERRORS.create("expanded-key", []);
    return SaplingExpandedSpendingKey.#fromParts(ask, nsk, bytes.subarray(2 * PART_BYTES));
  }

  /**
   * The key of ask, nsk (both below r_J) and a copy of ovk: ak = [ask]G, nk = [nsk]H and ivk =
   * CRH^ivk(ak, nk).
   */
  static #fromParts(ask: bigint, nsk: bigint, ovk: Uint8Array): SaplingExpandedSpendingKey {
    if (ask === 0n) throw ERRORS.create("invalid", []);
    const { spendAuth, proofGeneration } = saplingGenerators();
    const viewing = new Uint8Array(EXPANDED_KEY_BYTES);
    const ak = spendAuth.multiply(ask).toBytes();
    // [0]H is the identity, which Noble's constant-time multiply refuses to return.
    const nk = (nsk === 0n ? jubjub.Point.ZERO : proofGeneration.multiply(nsk)).toBytes();
    try {
      viewing.set(ak, 0);
      viewing.set(nk, PART_BYTES);
      viewing.set(ovk, 2 * PART_BYTES);
    } finally {
      wipe(ak, nk);
    }
    const ivk = blake2s(viewing.subarray(0, 2 * PART_BYTES), {
      dkLen: PART_BYTES,
      personalization: IVK_PERSONALIZATION,
    });
    ivk[PART_BYTES - 1] = (ivk[PART_BYTES - 1] ?? 0) & IVK_TOP_BYTE_MASK;
    if (ivk.every((byte) => byte === 0)) {
      wipe(viewing, ivk);
      throw ERRORS.create("invalid", []);
    }
    const expanded = new Uint8Array(EXPANDED_KEY_BYTES);
    writeScalar(expanded, 0, ask);
    writeScalar(expanded, PART_BYTES, nsk);
    expanded.set(ovk, 2 * PART_BYTES);
    return new SaplingExpandedSpendingKey(expanded, viewing, ivk);
  }

  /** Refuses (sapling.key.wiped) any use after wipe(). */
  #assertLive(): void {
    if (this.#wiped) throw ERRORS.create("wiped", []);
  }

  /** A copy of ask ‖ nsk ‖ ovk (96 bytes, the scalars little-endian); the caller wipes it. */
  bytes(): Uint8Array {
    this.#assertLive();
    return this.#expanded.slice();
  }

  /** A copy of the full viewing key ak ‖ nk ‖ ovk (96 bytes); the caller wipes it. */
  fullViewingKey(): Uint8Array {
    this.#assertLive();
    return this.#viewing.slice();
  }

  /** A copy of the incoming viewing key ivk (32 little-endian bytes); the caller wipes it. */
  incomingViewingKey(): Uint8Array {
    this.#assertLive();
    return this.#ivk.slice();
  }

  /**
   * pk_d, the 32-byte diversified transmission key of the address with diversifier `diversifier`
   * ("Sapling Key Components"). Refuses (sapling.key.diversifier) a diversifier that is not 11
   * bytes or does not hash to a point, which no address has.
   */
  transmissionKey(diversifier: Uint8Array): Uint8Array {
    this.#assertLive();
    const base =
      diversifier.length === SAPLING_DIVERSIFIER_BYTES ? diversifyHash(diversifier) : null;
    if (base === null) throw ERRORS.create("diversifier", []);
    return transmissionKeyOf(this.#ivk, base);
  }

  /**
   * Erases the key's parts, as far as the runtime allows; every later use but wipe() is refused
   * (sapling.key.wiped).
   */
  wipe(): void {
    this.#wiped = true;
    wipe(this.#expanded, this.#viewing, this.#ivk);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** A Sapling payment address of an extended key: its diversifier index j, d and pk_d. */
export interface SaplingAddress {
  /** j, from 0 to SAPLING_MAX_DIVERSIFIER_INDEX. */
  readonly index: bigint;
  /** d, 11 bytes. */
  readonly diversifier: Uint8Array;
  /** pk_d, the diversified transmission key, 32 bytes. */
  readonly transmissionKey: Uint8Array;
}

/** Refuses (sapling.key.diversifier-index) an index j outside 0 to 2^88 − 1. */
function assertDiversifierIndex(index: bigint): void {
  if (index < 0n || index > SAPLING_MAX_DIVERSIFIER_INDEX)
    throw ERRORS.create("diversifier-index", []);
}

/**
 * A Sapling extended spending key of ZIP-32: the key components with the diversifier key dk, a
 * chain code, and its depth, parent tag and child number. Only hardened children are derived.
 */
export class SaplingExtendedSpendingKey implements Disposable {
  readonly #key: SaplingExpandedSpendingKey;
  readonly #dk: Uint8Array;
  readonly #chainCode: Uint8Array;
  readonly #depth: number;
  readonly #parentTag: Uint8Array;
  readonly #childNumber: number;
  #wiped = false;

  /** Takes ownership of the key and the byte parts. */
  private constructor(
    key: SaplingExpandedSpendingKey,
    dk: Uint8Array,
    chainCode: Uint8Array,
    depth: number,
    parentTag: Uint8Array,
    childNumber: number,
  ) {
    this.#key = key;
    this.#dk = dk;
    this.#chainCode = chainCode;
    this.#depth = depth;
    this.#parentTag = parentTag;
    this.#childNumber = childNumber;
  }

  /**
   * ZIP-32's master key of `seed` ("Sapling master key generation"): I = BLAKE2b-512
   * ("ZcashIP32Sapling", seed), its left half the spending key, its right half the chain code, and
   * dk the first 32 bytes of PRF^expand(sk, [0x10]). The caller wipes its seed. Refuses
   * (sapling.key.seed) a seed outside 32 to 252 bytes, and (sapling.key.invalid) a master key whose
   * ask or ivk is zero.
   */
  static fromSeed(seed: Uint8Array): SaplingExtendedSpendingKey {
    if (seed.length < SEED_MIN_BYTES || seed.length > SEED_MAX_BYTES)
      throw ERRORS.create("seed", []);
    const digest = blake2b(seed, {
      dkLen: 2 * PART_BYTES,
      personalization: MASTER_PERSONALIZATION,
    });
    try {
      const spendingKey = digest.subarray(0, PART_BYTES);
      const key = SaplingExpandedSpendingKey.fromSpendingKey(spendingKey);
      return new SaplingExtendedSpendingKey(
        key,
        expandTruncated(spendingKey, DOMAIN.dk),
        digest.slice(PART_BYTES),
        0,
        new Uint8Array(TAG_BYTES),
        0,
      );
    } finally {
      wipe(digest);
    }
  }

  /**
   * The key at the hardened `indexes` below this one, such as [32, 133, account] for an account's
   * key: a new key the caller wipes; this key is left as it is, and every key between them is
   * wiped. Before anything is derived, refuses an index outside 0 to 2^31 − 1 at any level, and
   * (sapling.key.depth) a path that would end more than 255 levels below the master, the most that
   * ZIP-32's one depth byte holds. A child whose ask or ivk is zero is refused
   * (sapling.key.invalid).
   */
  deriveHardened(indexes: readonly number[]): SaplingExtendedSpendingKey {
    this.#assertLive();
    if (this.#depth + indexes.length > MAX_BIP32_DEPTH) throw ERRORS.create("depth", []);
    const numbers = indexes.map(
      (index) => assertIndex(index, "Child index") + BIP32_HARDENED_OFFSET,
    );
    let key: SaplingExtendedSpendingKey | null = null;
    for (const number of numbers) {
      const parent: SaplingExtendedSpendingKey | null = key;
      try {
        key = (parent ?? this).#child(number);
      } finally {
        parent?.wipe();
      }
    }
    return key ?? this.#copy();
  }

  /** A copy of this key, for an empty path; the caller wipes it. */
  #copy(): SaplingExtendedSpendingKey {
    const expanded = this.#key.bytes();
    try {
      return new SaplingExtendedSpendingKey(
        SaplingExpandedSpendingKey.fromBytes(expanded),
        this.#dk.slice(),
        this.#chainCode.slice(),
        this.#depth,
        this.#parentTag.slice(),
        this.#childNumber,
      );
    } finally {
      wipe(expanded);
    }
  }

  /**
   * The hardened child of child number `number` (ZIP-32 "Sapling child key derivation"): I =
   * PRF^expand(c, [0x11] ‖ ask ‖ nsk ‖ ovk ‖ dk ‖ LE32(i)); ask and nsk gain ToScalar of
   * PRF^expand(I_L, [0x13]) and [0x14], ovk and dk are PRF^expand(I_L, [0x15] ‖ ovk) and
   * ([0x16] ‖ dk) truncated, and I_R is the child's chain code.
   */
  #child(number: number): SaplingExtendedSpendingKey {
    const parent = this.#key.bytes();
    const child = new Uint8Array(EXPANDED_KEY_BYTES);
    const digest = prfExpand(
      this.#chainCode,
      DOMAIN.hardenedChild,
      parent,
      this.#dk,
      numberToBytesLE(number, CHILD_NUMBER_BYTES),
    );
    const tweak = digest.subarray(0, PART_BYTES);
    try {
      const add = (domain: number, at: number): bigint =>
        (expandToScalar(tweak, domain) + bytesToNumberLE(parent.subarray(at, at + PART_BYTES))) %
        SUBGROUP_ORDER;
      writeScalar(child, 0, add(DOMAIN.childAsk, 0));
      writeScalar(child, PART_BYTES, add(DOMAIN.childNsk, PART_BYTES));
      const ovk = expandTruncated(tweak, DOMAIN.childOvk, parent.subarray(2 * PART_BYTES));
      child.set(ovk, 2 * PART_BYTES);
      wipe(ovk);
      return new SaplingExtendedSpendingKey(
        SaplingExpandedSpendingKey.fromBytes(child),
        expandTruncated(tweak, DOMAIN.childDk, this.#dk),
        digest.slice(PART_BYTES),
        this.#depth + 1,
        this.fingerprint().slice(0, TAG_BYTES),
        number,
      );
    } finally {
      wipe(parent, child, digest);
    }
  }

  /** Refuses (sapling.key.wiped) any use after wipe(). */
  #assertLive(): void {
    if (this.#wiped) throw ERRORS.create("wiped", []);
  }

  /** depth ‖ parent tag ‖ LE32(child number) ‖ chain code, the start of both ZIP-32 encodings. */
  #header(): Uint8Array {
    return concatBytes(
      Uint8Array.of(this.#depth),
      this.#parentTag,
      numberToBytesLE(this.#childNumber, CHILD_NUMBER_BYTES),
      this.#chainCode,
    );
  }

  /**
   * The 169 bytes of ZIP-32's extended spending key encoding (before Bech32): depth, parent tag,
   * child number, chain code, ask ‖ nsk ‖ ovk and dk. The caller wipes it.
   */
  bytes(): Uint8Array {
    this.#assertLive();
    const header = this.#header();
    const expanded = this.#key.bytes();
    try {
      return concatBytes(header, expanded, this.#dk);
    } finally {
      wipe(header, expanded);
    }
  }

  /**
   * The 169 bytes of ZIP-32's extended full viewing key encoding (before Bech32): depth, parent
   * tag, child number, chain code, ak ‖ nk ‖ ovk and dk. It shows every payment of the key's
   * addresses, so the caller treats and wipes it as a secret.
   */
  extendedFullViewingKey(): Uint8Array {
    this.#assertLive();
    const header = this.#header();
    const parts = this.fullViewingKeyEncoding();
    try {
      return concatBytes(header, parts);
    } finally {
      wipe(header, parts);
    }
  }

  /**
   * ZIP-316's Sapling FVK Encoding of this key, EncodeExtFVKParts(ak, nk, ovk, dk) of ZIP-32: the
   * 128 bytes of the full viewing key without the extended key's header. It is made from the
   * viewing parts alone, never from ask or nsk; the caller treats and wipes it as a secret.
   */
  fullViewingKeyEncoding(): Uint8Array {
    this.#assertLive();
    const viewing = this.#key.fullViewingKey();
    try {
      return concatBytes(viewing, this.#dk);
    } finally {
      wipe(viewing);
    }
  }

  /**
   * ZIP-316's Sapling IVK Encoding of this key, dk ‖ I2LEOSP_256(ivk): 64 bytes, made from the
   * viewing parts alone; the caller wipes it.
   */
  incomingViewingKeyEncoding(): Uint8Array {
    this.#assertLive();
    const ivk = this.#key.incomingViewingKey();
    try {
      return concatBytes(this.#dk, ivk);
    } finally {
      wipe(ivk);
    }
  }

  /** The incoming viewing key ivk (32 little-endian bytes); the caller wipes it. */
  incomingViewingKey(): Uint8Array {
    this.#assertLive();
    return this.#key.incomingViewingKey();
  }

  /**
   * The 32-byte fingerprint of the full viewing key, BLAKE2b-256("ZcashSaplingFVFP", ak ‖ nk ‖
   * ovk) (ZIP-32 "Sapling Full Viewing Key Fingerprints and Tags"); its first 4 bytes are the tag
   * that the key's children carry.
   */
  fingerprint(): Uint8Array {
    this.#assertLive();
    const viewing = this.#key.fullViewingKey();
    try {
      return blake2b(viewing, { dkLen: PART_BYTES, personalization: FINGERPRINT_PERSONALIZATION });
    } finally {
      wipe(viewing);
    }
  }

  /**
   * The address at diversifier index `index` (ZIP-32 "Sapling diversifier derivation"): d =
   * FF1-AES256(dk, I2LEBSP_88(j)) and pk_d = [ivk] DiversifyHash(d), or null when d is not a valid
   * diversifier. Refuses (sapling.key.diversifier-index) an index outside 0 to 2^88 − 1.
   */
  addressAt(index: bigint): SaplingAddress | null {
    this.#assertLive();
    assertDiversifierIndex(index);
    // FF1's binary alphabet reads each byte least-significant bit first, which is I2LEBSP_88.
    const diversifier = BinaryFF1(this.#dk).encrypt(
      numberToBytesLE(index, SAPLING_DIVERSIFIER_BYTES),
    );
    const base = diversifyHash(diversifier);
    if (base === null) return null;
    const ivk = this.#key.incomingViewingKey();
    try {
      return Object.freeze({ index, diversifier, transmissionKey: transmissionKeyOf(ivk, base) });
    } finally {
      wipe(ivk);
    }
  }

  /**
   * The address at the least valid diversifier index from `start` on, trying at most `count`
   * indexes and none past 2^88 − 1; null when none of them has an address. From 0 it gives ZIP-32's
   * default address. Refuses (sapling.key.diversifier-index) a start outside 0 to 2^88 − 1 and
   * (sapling.key.count) a count that is not a whole number from 1 up.
   */
  nextAddress(start: bigint, count: number): SaplingAddress | null {
    this.#assertLive();
    assertDiversifierIndex(start);
    if (!Number.isSafeInteger(count) || count < 1) throw ERRORS.create("count", []);
    const last = start + BigInt(count) - 1n;
    const end = last < SAPLING_MAX_DIVERSIFIER_INDEX ? last : SAPLING_MAX_DIVERSIFIER_INDEX;
    for (let index = start; index <= end; index += 1n) {
      const address = this.addressAt(index);
      if (address !== null) return address;
    }
    return null;
  }

  /**
   * The diversifier index j of the diversifier `diversifier` under this key: FF1-AES256.Decrypt(dk,
   * d) read back as I2LEBSP_88, the inverse of addressAt's encryption, so that d is the
   * diversifier of index j whichever key made it. Refuses (sapling.key.diversifier) a diversifier
   * that is not 11 bytes or does not hash to a point, which no address has.
   */
  diversifierIndexOf(diversifier: Uint8Array): bigint {
    this.#assertLive();
    if (diversifier.length !== SAPLING_DIVERSIFIER_BYTES || diversifyHash(diversifier) === null)
      throw ERRORS.create("diversifier", []);
    const index = BinaryFF1(this.#dk).decrypt(diversifier);
    try {
      return bytesToNumberLE(index);
    } finally {
      wipe(index);
    }
  }

  /**
   * Whether this key's incoming viewing key owns the raw payment address `address`, d ‖ pk_d (43
   * bytes): pk_d = [ivk] DiversifyHash(d) ("Sapling Key Components"). It finds an address at any
   * diversifier index without deriving the indexes before it; diversifierIndexOf(d) then gives its
   * j. Refuses (sapling.key.diversifier) an address that is not 43 bytes or whose diversifier does
   * not hash to a point.
   */
  ownsAddress(address: Uint8Array): boolean {
    this.#assertLive();
    if (address.length !== SAPLING_ADDRESS_BYTES) throw ERRORS.create("diversifier", []);
    const transmissionKey = this.#key.transmissionKey(
      address.subarray(0, SAPLING_DIVERSIFIER_BYTES),
    );
    try {
      return equalBytes(transmissionKey, address.subarray(SAPLING_DIVERSIFIER_BYTES));
    } finally {
      wipe(transmissionKey);
    }
  }

  /**
   * Erases the key components, dk and the chain code, as far as the runtime allows; every later use
   * but wipe() is refused (sapling.key.wiped).
   */
  wipe(): void {
    this.#wiped = true;
    this.#key.wipe();
    wipe(this.#dk, this.#chainCode);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}
