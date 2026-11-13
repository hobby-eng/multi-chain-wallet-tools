// ZIP-316's unified encodings, Revision 0 on mainnet (https://zips.z.cash/zip-0316; zcash/zips
// @b50fbba zips/zip-0316.rst): a Unified Address (HRP u), a Unified Full Viewing Key (uview) and a
// Unified Incoming Viewing Key (uivk). The raw encoding is a list of items, each a CompactSize
// typecode, a CompactSize length and the item's bytes, in ascending typecode order; the HRP padded to
// 16 bytes is appended, F4Jumble mixes the whole ("Jumbling"), and Bech32m writes it without BIP-350's
// length limit. Decoding refuses whatever ZIP-316 says a consumer must refuse; it reads the items
// this version knows (P2PKH, P2SH and Sapling) and keeps every other item unread, with its typecode,
// as ZIP-316 asks of items a consumer does not recognise. Orchard (typecode 3) is kept unread too,
// once its length is that of its encoding, and it counts as the shielded item that Revision 0
// requires. Accepted: Orchard's points and keys are not checked, since they need Pallas and
// Sinsemilla, which come with Orchard itself (wave 4); no Orchard item is used here. Revision 2 (zu,
// tu, uvf, uvi) and testnet encodings are refused, not guessed at. Viewing keys are secrets here:
// every working copy is wiped, and the decoded items have an owner that wipes them, as far as the
// runtime allows (the text itself cannot be wiped).
import { blake2b } from "@noble/hashes/blake2.js";
import { bech32m } from "@scure/base";
import { encodeCompactSize, readCompactSize } from "@ckd/core/compact-size.js";
import { concatBytes, secp256k1, wipe } from "@ckd/core/crypto.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import {
  isSaplingAddressEncoding,
  isSaplingFullViewingKeyEncoding,
  isSaplingIncomingViewingKeyEncoding,
} from "../../zip32-sapling.js";

/** ℓ_H, BLAKE2b's longest output, the most bytes of the Feistel's left half ("Jumbling"). */
const HASH_BYTES = 64;
/** The shortest and the longest message F4Jumble takes, ℓ^MAX_M = (2^16 + 1) · ℓ_H ("Jumbling"). */
const MIN_JUMBLE_BYTES = 38;
const MAX_JUMBLE_BYTES = (2 ** 16 + 1) * HASH_BYTES;
/** The padding: the HRP in US-ASCII, padded with zero bytes to 16 bytes. */
const PADDING_BYTES = 16;
/** The largest typecode and length ("Encoding of Unified Addresses": at most 0x2000000). */
const MAX_FIELD = 0x200_0000n;
/** Bech32's checksum characters and bits per character. */
const CHECKSUM_CHARACTERS = 6;
const BITS_PER_CHARACTER = 5;

/** The typecodes this version reads ("Typecode Registry"). */
const TYPECODE = Object.freeze({ p2pkh: 0, p2sh: 1, sapling: 2, orchard: 3 });
/** The shielded typecodes, one of which a Revision 0 encoding holds. */
const SHIELDED_TYPECODES: readonly number[] = [TYPECODE.sapling, TYPECODE.orchard];
/** The MUST-understand metadata typecodes, which no Revision 0 encoding may hold ("Metadata Items"). */
const MUST_UNDERSTAND = Object.freeze({ first: 0xe0, last: 0xfc });

/** BLAKE2b personalizations of F4Jumble's H_i and G_i, before their round and block bytes. */
const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
const JUMBLE_H_PERSONALIZATION = ascii("UA_F4Jumble_H");
const JUMBLE_G_PERSONALIZATION = ascii("UA_F4Jumble_G");

/** What a unified encoding holds. */
export type UnifiedKind = "address" | "full-viewing-key" | "incoming-viewing-key";

/** The items this version reads, each as its ZIP-316 encoding. */
export interface UnifiedItems {
  /**
   * In an address, the 20-byte hash of the P2PKH key; in a viewing key, the 65 bytes c ‖ ser_P(pk)
   * of BIP32's account key (full) or its external branch key at …/0 (incoming).
   */
  readonly p2pkh?: Uint8Array;
  /** In an address only, the 20-byte hash of the P2SH script. */
  readonly p2sh?: Uint8Array;
  /**
   * The raw Sapling address (43 bytes), FVK Encoding (128 bytes, from
   * SaplingExtendedSpendingKey.fullViewingKeyEncoding()) or IVK Encoding (64 bytes, from
   * incomingViewingKeyEncoding()).
   */
  readonly sapling?: Uint8Array;
}

/** An item this version does not read: its typecode and bytes, as found. */
export interface UnrecognisedItem {
  readonly typecode: number;
  readonly bytes: Uint8Array;
}

/**
 * A decoded unified encoding: the items this version reads, and the others in their order. It owns
 * their bytes: wipe() erases them, as far as the runtime allows, which a decoded viewing key needs.
 */
export class DecodedUnified implements UnifiedItems, Disposable {
  readonly p2pkh?: Uint8Array;
  readonly p2sh?: Uint8Array;
  readonly sapling?: Uint8Array;
  readonly unrecognised: readonly UnrecognisedItem[];

  /** Takes ownership of the items' bytes, as decodeUnified hands them over. */
  constructor(items: UnifiedItems, unrecognised: readonly UnrecognisedItem[]) {
    if (items.p2pkh !== undefined) this.p2pkh = items.p2pkh;
    if (items.p2sh !== undefined) this.p2sh = items.p2sh;
    if (items.sapling !== undefined) this.sapling = items.sapling;
    this.unrecognised = unrecognised;
  }

  /** Erases the bytes of every item, read or not. */
  wipe(): void {
    wipe(this.p2pkh, this.p2sh, this.sapling, ...this.unrecognised.map(({ bytes }) => bytes));
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Each kind's HRP, name and the checks of the items it reads; a viewing key reads no P2SH item. */
interface KindRules {
  readonly hrp: string;
  readonly noun: string;
  /** The bytes of an Orchard item: a raw address, an FVK Encoding or an IVK Encoding. */
  readonly orchardBytes: number;
  readonly p2pkh: (bytes: Uint8Array) => boolean;
  readonly p2sh: ((bytes: Uint8Array) => boolean) | undefined;
  readonly sapling: (bytes: Uint8Array) => boolean;
}

/** A transparent receiver's 20-byte hash: any bytes of that length. */
const isHash = (bytes: Uint8Array): boolean => bytes.length === 20;
/** A P2PKH viewing key item: a chain code and a compressed secp256k1 public key that is valid. */
const isTransparentKey = (bytes: Uint8Array): boolean =>
  bytes.length === 65 && secp256k1.utils.isValidPublicKey(bytes.subarray(32), true);

const KINDS: Readonly<Record<UnifiedKind, KindRules>> = Object.freeze({
  address: {
    hrp: "u",
    noun: "unified address",
    orchardBytes: 43,
    p2pkh: isHash,
    p2sh: isHash,
    sapling: isSaplingAddressEncoding,
  },
  "full-viewing-key": {
    hrp: "uview",
    noun: "unified full viewing key",
    orchardBytes: 96,
    p2pkh: isTransparentKey,
    // Revision 0: typecode 1 "MUST NOT be included in a UFVK or UIVK by Producers, and MUST be
    // treated as unrecognised by Consumers".
    p2sh: undefined,
    sapling: isSaplingFullViewingKeyEncoding,
  },
  "incoming-viewing-key": {
    hrp: "uivk",
    noun: "unified incoming viewing key",
    orchardBytes: 64,
    p2pkh: isTransparentKey,
    p2sh: undefined,
    sapling: isSaplingIncomingViewingKeyEncoding,
  },
});

/** The HRPs of Revision 2, on mainnet and testnet ("Revisions"), which this version does not read. */
const REVISION_2_PREFIXES: readonly string[] = ["zu", "tu", "uvf", "uvi"].flatMap((prefix) => [
  prefix,
  `${prefix}test`,
]);
/** The suffix of a testnet HRP. */
const TESTNET_SUFFIX = "test";

const ITEM_NAMES: Readonly<Record<keyof UnifiedItems | "orchard", string>> = Object.freeze({
  p2pkh: "P2PKH",
  p2sh: "P2SH",
  sapling: "Sapling",
  orchard: "Orchard",
});

const ERRORS = new ErrorCatalog("zcash.unified", {
  length: {
    kind: "range",
    text: () =>
      `A unified encoding holds ${MIN_JUMBLE_BYTES} to ${MAX_JUMBLE_BYTES} bytes (ZIP-316).`,
  },
  bech32m: { kind: "range", text: () => "This is not Bech32m text with a valid checksum." },
  prefix: {
    kind: "range",
    text: (noun: string, hrp: string) => `A ${noun} starts with ${hrp}1.`,
  },
  network: {
    kind: "range",
    text: () => "This unified encoding is for Zcash testnet; only mainnet is read.",
  },
  revision: {
    kind: "range",
    text: () =>
      "This unified encoding is of ZIP-316's Revision 2 (zu, tu, uvf, uvi), which is not read here.",
  },
  padding: {
    kind: "range",
    text: () => "The unified encoding does not end in the padding of its prefix (ZIP-316).",
  },
  encoding: {
    kind: "range",
    text: () => "The items of the unified encoding are not well formed (ZIP-316).",
  },
  order: {
    kind: "range",
    text: () => "The items of a unified encoding come in ascending order of typecode (ZIP-316).",
  },
  duplicate: {
    kind: "range",
    text: () => "A typecode appears more than once in the unified encoding.",
  },
  "must-understand": {
    kind: "range",
    text: () =>
      "A Revision 0 unified encoding holds no metadata item that must be understood (typecodes 0xE0 to 0xFC).",
  },
  item: {
    kind: "range",
    text: (name: string, noun: string) => `The ${name} item of the ${noun} is not valid.`,
  },
  transparent: {
    kind: "range",
    text: () => "A unified address holds a P2PKH receiver or a P2SH receiver, not both.",
  },
  shielded: {
    kind: "range",
    text: () => "A Revision 0 unified encoding holds a Sapling or an Orchard item.",
  },
  p2sh: {
    kind: "range",
    text: () => "A Revision 0 unified viewing key holds no P2SH item.",
  },
});

/** H_i(u) = BLAKE2b-(8·length)("UA_F4Jumble_H" ‖ [i, 0, 0], u) ("Jumbling"). */
function jumbleH(round: number, input: Uint8Array, length: number): Uint8Array {
  return blake2b(input, {
    dkLen: length,
    personalization: concatBytes(JUMBLE_H_PERSONALIZATION, Uint8Array.of(round, 0, 0)),
  });
}

/**
 * G_i(u), the first `length` bytes of BLAKE2b-512("UA_F4Jumble_G" ‖ [i] ‖ I2LEOSP_16(j), u) for j
 * from 0 on ("Jumbling").
 */
function jumbleG(round: number, input: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let block = 0; block * HASH_BYTES < length; block += 1) {
    const personalization = concatBytes(
      JUMBLE_G_PERSONALIZATION,
      Uint8Array.of(round, block & 0xff, block >> 8),
    );
    const digest = blake2b(input, { dkLen: HASH_BYTES, personalization });
    out.set(digest.subarray(0, length - block * HASH_BYTES), block * HASH_BYTES);
    wipe(digest);
  }
  return out;
}

/** Each round of the Feistel: which half it changes and the round of H or G it XORs in. */
const ROUNDS = Object.freeze({
  forward: [
    { half: "right", round: 0 },
    { half: "left", round: 0 },
    { half: "right", round: 1 },
    { half: "left", round: 1 },
  ],
  inverse: [
    { half: "left", round: 1 },
    { half: "right", round: 1 },
    { half: "left", round: 0 },
    { half: "right", round: 0 },
  ],
} as const);

/**
 * F4Jumble or its inverse ("Jumbling"): a copy of `message` split into a left half of min(ℓ_H,
 * ⌊ℓ_M/2⌋) bytes and the rest, then four rounds, each XORing G_i of the left half into the right
 * or H_i of the right half into the left. Refuses (zcash.unified.length) a message outside 38 to
 * ℓ^MAX_M bytes.
 */
function feistel(message: Uint8Array, direction: keyof typeof ROUNDS): Uint8Array {
  if (message.length < MIN_JUMBLE_BYTES || message.length > MAX_JUMBLE_BYTES)
    throw ERRORS.create("length", []);
  const out = message.slice();
  const leftLength = Math.min(HASH_BYTES, Math.floor(message.length / 2));
  const left = out.subarray(0, leftLength);
  const right = out.subarray(leftLength);
  for (const { half, round } of ROUNDS[direction]) {
    const [target, mask] =
      half === "right"
        ? [right, jumbleG(round, left, right.length)]
        : [left, jumbleH(round, right, left.length)];
    for (let at = 0; at < target.length; at += 1) target[at] = (target[at] ?? 0) ^ (mask[at] ?? 0);
    wipe(mask);
  }
  return out;
}

/** F4Jumble(M) of ZIP-316 ("Jumbling"), a new array; refuses a message outside 38 to 4194368 bytes. */
export function f4Jumble(message: Uint8Array): Uint8Array {
  return feistel(message, "forward");
}

/** F4Jumble⁻¹(M) of ZIP-316 ("Jumbling"), a new array; refuses a message outside 38 to 4194368 bytes. */
export function f4JumbleInverse(message: Uint8Array): Uint8Array {
  return feistel(message, "inverse");
}

/** The HRP in US-ASCII padded with zero bytes to 16 bytes. */
function paddingOf(hrp: string): Uint8Array {
  const padding = new Uint8Array(PADDING_BYTES);
  padding.set(ascii(hrp));
  return padding;
}

/** The rule that reads `typecode` in a `kind`, or undefined when this version does not read it. */
function ruleOf(
  kind: UnifiedKind,
  typecode: number,
):
  | { readonly name: keyof UnifiedItems; readonly valid: (bytes: Uint8Array) => boolean }
  | undefined {
  const rules = KINDS[kind];
  if (typecode === TYPECODE.p2pkh) return { name: "p2pkh", valid: rules.p2pkh };
  if (typecode === TYPECODE.p2sh && rules.p2sh !== undefined)
    return { name: "p2sh", valid: rules.p2sh };
  if (typecode === TYPECODE.sapling) return { name: "sapling", valid: rules.sapling };
  return undefined;
}

/** Refuses (zcash.unified.transparent) a P2PKH and a P2SH item together. */
function assertOneTransparent(items: UnifiedItems): void {
  if (items.p2pkh !== undefined && items.p2sh !== undefined) throw ERRORS.create("transparent", []);
}

/**
 * The Bech32m text of a unified `kind` holding `items` (ZIP-316 Revision 0, mainnet). Refuses
 * (zcash.unified.shielded) items without a Sapling item, the one shielded item this version writes;
 * (zcash.unified.transparent) a P2PKH and a P2SH item together; (zcash.unified.p2sh) a P2SH item in
 * a viewing key; and (zcash.unified.item) an item that is not valid for its kind. The items are
 * read, not kept; the caller wipes those of a viewing key.
 */
export function encodeUnified(kind: UnifiedKind, items: UnifiedItems): string {
  const rules = KINDS[kind];
  if (items.sapling === undefined) throw ERRORS.create("shielded", []);
  if (items.p2sh !== undefined && rules.p2sh === undefined) throw ERRORS.create("p2sh", []);
  assertOneTransparent(items);
  const parts: Uint8Array[] = [];
  for (const [name, typecode] of [
    ["p2pkh", TYPECODE.p2pkh],
    ["p2sh", TYPECODE.p2sh],
    ["sapling", TYPECODE.sapling],
  ] as const) {
    const bytes = items[name];
    if (bytes === undefined) continue;
    if (ruleOf(kind, typecode)?.valid(bytes) !== true)
      throw ERRORS.create("item", [ITEM_NAMES[name], rules.noun]);
    parts.push(encodeCompactSize(typecode), encodeCompactSize(bytes.length), bytes);
  }
  const raw = concatBytes(...parts, paddingOf(rules.hrp));
  const jumbled = f4Jumble(raw);
  const words = bech32m.toWords(jumbled);
  try {
    return bech32m.encode(rules.hrp, words, false);
  } finally {
    wipe(raw, jumbled);
    words.fill(0);
  }
}

/** The longest text of a `hrp`: ℓ^MAX_M bytes in Bech32m, with its separator and checksum. */
function maxTextLength(hrp: string): number {
  return (
    hrp.length + 1 + Math.ceil((MAX_JUMBLE_BYTES * 8) / BITS_PER_CHARACTER) + CHECKSUM_CHARACTERS
  );
}

/** The bytes of Bech32m `text` under the HRP of `kind`; refuses any other text (decodeUnified). */
function unjumbledBytes(kind: UnifiedKind, text: string): Uint8Array {
  const { hrp, noun } = KINDS[kind];
  if (text.length > maxTextLength(hrp)) throw ERRORS.create("length", []);
  let decoded: { readonly prefix: string; readonly words: number[] };
  let jumbled: Uint8Array;
  try {
    decoded = bech32m.decode(text, false);
    // fromWords refuses padding bits that are not zero or more than four of them (BIP-173).
    jumbled = bech32m.fromWords(decoded.words);
  } catch {
    // @scure/base's messages quote the text, which may be anything a person pasted.
    throw ERRORS.create("bech32m", []);
  }
  try {
    const { prefix } = decoded;
    if (prefix !== hrp) {
      if (REVISION_2_PREFIXES.includes(prefix)) throw ERRORS.create("revision", []);
      if (prefix === `${hrp}${TESTNET_SUFFIX}`) throw ERRORS.create("network", []);
      throw ERRORS.create("prefix", [noun, hrp]);
    }
    const raw = feistel(jumbled, "inverse");
    const padding = paddingOf(hrp);
    const body = raw.length - PADDING_BYTES;
    if (raw.subarray(body).some((byte, at) => byte !== padding[at])) {
      wipe(raw);
      throw ERRORS.create("padding", []);
    }
    return raw.subarray(0, body);
  } finally {
    wipe(jumbled);
    decoded.words.fill(0);
  }
}

/** The CompactSize at `offset` of `raw` that a field may hold; refuses one ZIP-316 does not admit. */
function fieldAt(
  raw: Uint8Array,
  offset: number,
): { readonly value: number; readonly end: number } {
  const field = readCompactSize(raw, offset);
  if (field === undefined || field.value > MAX_FIELD) throw ERRORS.create("encoding", []);
  return { value: Number(field.value), end: field.end };
}

/**
 * The unified `kind` that `text` encodes (ZIP-316 Revision 0, mainnet): its items this version
 * reads, each checked, and the others unread. Refuses, as ZIP-316 asks of a consumer: text that is
 * not Bech32m (zcash.unified.bech32m); another HRP (zcash.unified.prefix), a testnet one
 * (zcash.unified.network) or a Revision 2 one (zcash.unified.revision); a length outside 38 to
 * 4194368 bytes (zcash.unified.length); a wrong padding (zcash.unified.padding); fields that do not
 * parse, are not CompactSize's shortest form, exceed 0x2000000 or leave bytes over
 * (zcash.unified.encoding); typecodes out of order (zcash.unified.order) or repeated
 * (zcash.unified.duplicate); a MUST-understand metadata item (zcash.unified.must-understand); an
 * item it reads that is not valid, or an Orchard item of another length than its encoding's
 * (zcash.unified.item); both transparent receivers (zcash.unified.transparent); and no shielded
 * item (zcash.unified.shielded), which also refuses an encoding of metadata items only. The result
 * owns copies of the items; the caller wipes it (DecodedUnified.wipe) when they are a viewing
 * key's.
 */
export function decodeUnified(kind: UnifiedKind, text: string): DecodedUnified {
  const raw = unjumbledBytes(kind, text);
  const items: { -readonly [Name in keyof UnifiedItems]: Uint8Array } = {};
  const unrecognised: UnrecognisedItem[] = [];
  try {
    let shielded = false;
    let previous = -1;
    for (let at = 0; at < raw.length;) {
      const typecode = fieldAt(raw, at);
      const length = fieldAt(raw, typecode.end);
      const end = length.end + length.value;
      if (end > raw.length) throw ERRORS.create("encoding", []);
      if (typecode.value === previous) throw ERRORS.create("duplicate", []);
      if (typecode.value < previous) throw ERRORS.create("order", []);
      if (typecode.value >= MUST_UNDERSTAND.first && typecode.value <= MUST_UNDERSTAND.last)
        throw ERRORS.create("must-understand", []);
      const bytes = raw.slice(length.end, end);
      const rule = ruleOf(kind, typecode.value);
      // Orchard's encodings have fixed lengths ("Encoding of Unified Full/Incoming Viewing Keys";
      // librustzcash's zcash_address reads a receiver as [u8; 43]), checked before it counts.
      const orchard = typecode.value === TYPECODE.orchard;
      const valid = rule?.valid(bytes) ?? (!orchard || bytes.length === KINDS[kind].orchardBytes);
      if (!valid) {
        wipe(bytes);
        throw ERRORS.create("item", [ITEM_NAMES[rule?.name ?? "orchard"], KINDS[kind].noun]);
      }
      if (rule === undefined) unrecognised.push({ typecode: typecode.value, bytes });
      else items[rule.name] = bytes;
      shielded ||= SHIELDED_TYPECODES.includes(typecode.value);
      previous = typecode.value;
      at = end;
    }
    assertOneTransparent(items);
    if (!shielded) throw ERRORS.create("shielded", []);
    return new DecodedUnified(items, unrecognised);
  } catch (error) {
    wipe(...Object.values(items), ...unrecognised.map(({ bytes }) => bytes));
    throw error;
  } finally {
    wipe(raw);
  }
}
