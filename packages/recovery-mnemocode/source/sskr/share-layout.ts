// How the bytes of an SSKR share are laid out (BCR-2020-011, CBOR of RFC 8949): an optional CBOR
// tag, the head of a byte string, then the payload, five bytes of metadata and the secret. The
// reader of complete shares (transport.ts), the repair of marked ones (repair.ts, joint-repair.ts)
// each take these facts from here, and read or infer the layout in their own way.
//
// Needs from the host: nothing.

import { BIP39_ENTROPY_BYTES } from "../core/bip39-sizes.js";

/** The head of a CBOR tag of two bytes (major type 6, additional information 25). */
export const CBOR_UINT16_TAG = 0xd9;
/** The head and the two bytes of the tag. */
export const CBOR_TAG_BYTES = 3;
/** The SSKR tag that Blockchain Commons registered (bc-tags), which MnemoCode writes. */
export const SSKR_CBOR_TAG = 40309;
/** The SSKR tag that earlier tools wrote, which is still read. */
const SSKR_LEGACY_CBOR_TAG = 309;
/** Every SSKR tag that a share may carry. */
export const SSKR_CBOR_TAGS: readonly number[] = Object.freeze([
  SSKR_CBOR_TAG,
  SSKR_LEGACY_CBOR_TAG,
]);

/** The bytes that open a share tagged with `tag`. */
export function tagBytes(tag: number): number[] {
  return [CBOR_UINT16_TAG, tag >> 8, tag & 0xff];
}

/** CBOR major type 2, a byte string: below 24 bytes its length may sit in the head itself. */
export const CBOR_BYTE_STRING = 0x40;
/** The head of a byte string whose length follows in one byte. */
export const CBOR_BYTE_STRING_ONE_BYTE_LENGTH = 0x58;
/** The first length that the head of a byte string cannot hold itself. */
export const CBOR_SHORT_LENGTH_LIMIT = 24;

/**
 * The heads that a byte string of `length` bytes may be written with: one byte where it fits, and
 * two.
 */
export function byteStringHeads(length: number): number[][] {
  return [
    ...(length < CBOR_SHORT_LENGTH_LIMIT ? [[CBOR_BYTE_STRING + length]] : []),
    [CBOR_BYTE_STRING_ONE_BYTE_LENGTH, length],
  ];
}

/** The lengths of the head of a byte string, the two-byte head first, as a share is read. */
const BYTE_STRING_HEAD_LENGTHS = [2, 1] as const;

/**
 * The ways in which `bytes` bytes after the tag hold the head of a byte string and the payload:
 * each payload length that a share has (SHARE_LENGTHS), with a head of the length that writes it
 * (byteStringHeads). The repair of a standard share of a known length reads it so.
 */
export function payloadLayouts(
  bytes: number,
): { readonly payloadLength: number; readonly head: number }[] {
  return BYTE_STRING_HEAD_LENGTHS.map((head) => ({ payloadLength: bytes - head, head })).filter(
    ({ payloadLength, head }) =>
      SHARE_LENGTHS.has(payloadLength) &&
      byteStringHeads(payloadLength).some((written) => written.length === head),
  );
}

/**
 * The SSKR metadata before the secret: two bytes of the identifier, then the group threshold and
 * count, then the group index and member threshold, then the member index, a nibble each, every
 * threshold and count less one. The high nibble of the member's byte is reserved and zero.
 */
export const SHARE_METADATA_BYTES = 5;
/** The byte of the metadata that holds the group threshold and the group count, a nibble each. */
export const GROUP_BYTE = 2;
/** The byte of the metadata that holds the group index and the member threshold, a nibble each. */
export const MEMBER_THRESHOLD_BYTE = 3;
/** The byte of the metadata that holds the member index in its low nibble. */
export const MEMBER_BYTE = 4;
/** The bits of a nibble, half a byte. */
export const NIBBLE_BITS = 4;
/** The mask of the low nibble of a byte. */
export const LOW_NIBBLE = 0x0f;

/**
 * A threshold or a count as its nibble stores it, less one (sskr 0.12.0, encoding.rs): the reader
 * of a share's metadata and the repair's choice of thresholds both read it so.
 */
export function storedCount(nibble: number): number {
  return nibble + 1;
}

/**
 * Members of one group: a nibble numbers them. The engine's own limit is the same, sskr 0.12.0's
 * MAX_SHARE_COUNT = 16 from bc-shamir 0.13.0; test/sskr-vectors.test.ts asks it to refuse one more.
 */
export const MAX_GROUP_MEMBERS = 2 ** NIBBLE_BITS;
/** Groups of one set: a nibble numbers them too. */
export const MAX_GROUPS = 2 ** NIBBLE_BITS;

/**
 * The least threshold that recorded shares may have: one share restores its group. A different
 * rule from a split's least threshold (sskr/split.ts, MIN_THRESHOLD), which a new split keeps.
 */
export const MIN_RECORDED_THRESHOLD = 1;

/**
 * Whether `threshold` of `count` shares is a quorum that a recorded SSKR group can have: whole
 * numbers, at least MIN_RECORDED_THRESHOLD, no more than there are, and at most MAX_GROUP_MEMBERS
 * shares. Each caller words its own refusal.
 */
export function isRecordedQuorum(threshold: number, count: number): boolean {
  return (
    Number.isSafeInteger(threshold) &&
    Number.isSafeInteger(count) &&
    threshold >= MIN_RECORDED_THRESHOLD &&
    count >= threshold &&
    count <= MAX_GROUP_MEMBERS
  );
}

/**
 * The least member threshold whose shares keep a digest beside the secret. A split with threshold
 * 1 copies the secret into every share, and its recovery returns the one share as it is
 * (bc-shamir 0.13.0, shamir.rs, split_secret and recover_secret), so nothing checks it. A split
 * refuses such a group, a restore cannot check it, and a repair cannot search it.
 */
export const MIN_DIGEST_THRESHOLD = 2;

/** Metadata and secret of a share, for secrets of 16 to 32 bytes: 12- to 24-word phrases. */
export const SHARE_LENGTHS: ReadonlySet<number> = new Set(
  BIP39_ENTROPY_BYTES.map((bytes) => bytes + SHARE_METADATA_BYTES),
);
