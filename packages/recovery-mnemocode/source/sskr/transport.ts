// The forms of an SSKR share and their transport: the UR with its CBOR and CRC-32, standard
// Bytewords, and MnemoCode's own forms that look like an encoded seed phrase (BIP39 word numbers,
// Unicode codes, RGB colors and colors as Unicode codes), each read back by its own checks; a
// share's metadata (its set, group and member); and the checks of a set before the SSKR library
// sees it. The units of each form are written through share-units.ts, and the mixed layout of the
// colors and words through mixed-layout.ts, which the repair of marked shares takes too.
//
// Share, at the end, is the entry: one share as read, with its metadata, written in any form, and
// Share.readSet, the shares of one set checked together. The library's own modules ask it. The
// free functions before it (shareInfo, urToTransport, transportToUr, urToBytewords, bytewordsToUr,
// shareToColors, colorsToShare, readShare, normalizeShare, writeShare, validateShareSet) stay for
// the hosts that already call them.
//
// Needs from the host: nothing.
// Does not: split, restore or repair shares (split.ts, share-set.ts, repair.ts, joint-repair.ts).
// Its messages never repeat a share.

import { codeTokens, completeHexUnits, elementsFit } from "../core/code-text.js";
import {
  byteStringHeads,
  CBOR_BYTE_STRING,
  CBOR_BYTE_STRING_ONE_BYTE_LENGTH,
  CBOR_SHORT_LENGTH_LIMIT,
  CBOR_TAG_BYTES,
  CBOR_UINT16_TAG,
  GROUP_BYTE,
  LOW_NIBBLE,
  MEMBER_BYTE,
  MEMBER_THRESHOLD_BYTE,
  NIBBLE_BITS,
  MAX_GROUPS,
  MAX_GROUP_MEMBERS,
  SHARE_LENGTHS,
  SHARE_METADATA_BYTES,
  SSKR_CBOR_TAG,
  SSKR_CBOR_TAGS,
  storedCount,
  tagBytes,
} from "./share-layout.js";
import { checksumAt, CRC32_BYTES, crc32 } from "./checksum.js";
import { SET_CONFLICT_TEXTS, SetTopology } from "./set-topology.js";
import {
  COLOR_FORM,
  mixedTransport,
  mixShare,
  ownUnitCount,
  WORD_FORM,
  type MixedForm,
} from "./mixed-layout.js";
import {
  BYTEWORD_LETTERS,
  BYTEWORD_SEPARATORS,
  bytewordUnits,
  SHARE_FORMATS,
  SHARE_UNITS,
  shareWordIndex,
  UR_SSKR_PREFIX,
  UR_SSKR_START,
  type ShareFormat,
  type ShareUnits,
} from "./share-units.js";
import {
  RGB_HEX_DIGITS,
  rgbHex,
  unicodeToColorCodes,
  COLOR_UNICODE_SYMBOL_CLASS,
} from "../core/colors.js";
import { runTogetherNumbers, unicodeIndexesOf, WORD_NUMBERS_RUN_TOGETHER } from "../core/words.js";
import { WORD_NUMBERS_THROUGH } from "../core/bip39-sizes.js";
import { Redacted } from "../core/redacted.js";
import { wipedAfter } from "../core/bits.js";
import { type EncodedFormat } from "../core/types.js";
import { EncodedForm } from "../core/encoded-form.js";
import { WordList } from "../core/word-hints.js";
import { bytewords } from "./bytewords-list.js";

export const CHECKSUM_BYTES = CRC32_BYTES;
export const MAX_TRANSPORT_BYTES = 128;
/** A single-part UR of a share: the prefix and bytewords, in any case, as the prefix is matched. */
const UR_SSKR = new RegExp(`${UR_SSKR_START.source}([a-z]+)$`, UR_SSKR_START.flags);
// The layout of a share, here too for the modules that take it with the transport; the forms, the
// UR's prefix, the reader of a word number and the mixed layout's facts too.
export { CBOR_TAG_BYTES, SHARE_LENGTHS };
export { SHARE_FORMATS, shareWordIndex, UR_SSKR_PREFIX, type ShareFormat };
export {
  COLOR_VERSION,
  RGB_BYTES,
  SHARE_HEADER_BYTES,
  WORD_VERSION,
  wordIndexesToBytes,
} from "./mixed-layout.js";
const MAX_COLOR_TEXT_LENGTH = 1024;
/** The shares of one set at most: every member of every group. */
const MAX_SET_SHARES = MAX_GROUPS * MAX_GROUP_MEMBERS;

function validateTransportChecksum(bytes: Uint8Array): void {
  if (bytes.length < CHECKSUM_BYTES + 1 || bytes.length > MAX_TRANSPORT_BYTES) {
    throw new Error("Invalid SSKR transport length.");
  }
  const checksumOffset = bytes.length - CHECKSUM_BYTES;
  if (crc32(bytes.subarray(0, checksumOffset)) !== checksumAt(bytes, checksumOffset)) {
    throw new Error("SSKR transport checksum does not match.");
  }
}

function addTransportChecksum(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + CHECKSUM_BYTES);
  bytes.set(payload);
  new DataView(bytes.buffer).setUint32(payload.length, crc32(payload));
  return bytes;
}

/** Only the definite byte-string CBOR form used by SSKR is accepted. */
function sharePayload(transport: Uint8Array): Uint8Array {
  validateTransportChecksum(transport);
  const cbor = transport.subarray(0, -CHECKSUM_BYTES);
  let offset = 0;
  if (cbor[0] === CBOR_UINT16_TAG) {
    const tag = (cbor[1]! << 8) | cbor[2]!;
    if (!SSKR_CBOR_TAGS.includes(tag)) throw new Error("Not an SSKR CBOR tag.");
    offset = CBOR_TAG_BYTES;
  }
  const header = cbor[offset++]!;
  let payloadLength = -1;
  if (header >= CBOR_BYTE_STRING && header < CBOR_BYTE_STRING + CBOR_SHORT_LENGTH_LIMIT) {
    payloadLength = header - CBOR_BYTE_STRING;
  } else if (header === CBOR_BYTE_STRING_ONE_BYTE_LENGTH) {
    payloadLength = cbor[offset++]!;
  }
  if (payloadLength !== cbor.length - offset || !SHARE_LENGTHS.has(payloadLength)) {
    throw new Error("Invalid SSKR share byte string.");
  }
  return cbor.subarray(offset);
}

export interface ShareInfo {
  readonly identifier: number;
  readonly groupThreshold: number;
  readonly groupCount: number;
  readonly groupIndex: number;
  readonly memberThreshold: number;
  readonly memberIndex: number;
  readonly secretLength: number;
}

/** Thresholds and group count are stored minus one; member/group indexes are zero-based. */
export function shareInfo(transport: Uint8Array): ShareInfo {
  const payload = sharePayload(transport);
  const info: ShareInfo = {
    identifier: (payload[0]! << 8) | payload[1]!,
    groupThreshold: storedCount(payload[GROUP_BYTE]! >>> NIBBLE_BITS),
    groupCount: storedCount(payload[GROUP_BYTE]! & LOW_NIBBLE),
    groupIndex: payload[MEMBER_THRESHOLD_BYTE]! >>> NIBBLE_BITS,
    memberThreshold: storedCount(payload[MEMBER_THRESHOLD_BYTE]! & LOW_NIBBLE),
    memberIndex: payload[MEMBER_BYTE]! & LOW_NIBBLE,
    secretLength: payload.length - SHARE_METADATA_BYTES,
  };
  const reservedBits = payload[MEMBER_BYTE]! >>> NIBBLE_BITS;
  if (
    reservedBits !== 0 ||
    info.groupThreshold > info.groupCount ||
    info.groupIndex >= info.groupCount
  ) {
    throw new Error("Invalid SSKR share metadata.");
  }
  return info;
}

/**
 * `tokens` as new bytes, each read by `units` (a UR pair or a Bytewords word), which are the
 * caller's. A token that is none is refused with `unknown`, and what was read before it is wiped
 * first: Uint8Array.from would leave its half-filled array behind (AUD-015-SEC001, AUD-016).
 */
function decodedBytes(tokens: readonly string[], units: ShareUnits, unknown: string): Uint8Array {
  const bytes = new Uint8Array(tokens.length);
  for (const [index, token] of tokens.entries()) {
    const byte = units.valueOf(token);
    if (byte === undefined) {
      bytes.fill(0);
      throw new Error(unknown);
    }
    bytes[index] = byte;
  }
  return bytes;
}

export function urToTransport(value: string): Uint8Array {
  const match = UR_SSKR.exec(value.trim());
  const body = match?.[1];
  if (!body || body.length % 2 !== 0 || body.length > MAX_TRANSPORT_BYTES * 2) {
    throw new Error("Expected a single-part ur:sskr record.");
  }
  const pairs = body.toLowerCase().match(/../gu)!;
  const bytes = decodedBytes(pairs, SHARE_UNITS.ur, "Unknown Bytewords pair in SSKR record.");
  // The bytes are the caller's once they are checked; a share refused here is wiped first.
  try {
    shareInfo(bytes);
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
  return bytes;
}

/**
 * The CBOR of a checked share without its checksum and without its tag, current or earlier, if it
 * has one, its byte string written with the shortest head (byteStringHeads): the bytes that every
 * form of a share writes, each adding the tag it needs. A share read with a longer head, which
 * sharePayload accepts, is written again so, because the SSKR library, which decodes
 * deterministic CBOR, refuses any other head (AUD-014-FUN001); the payload stays the same.
 */
function canonicalCbor(transport: Uint8Array): Uint8Array {
  const payload = sharePayload(transport);
  const head = byteStringHeads(payload.length)[0]!;
  const cbor = new Uint8Array(head.length + payload.length);
  cbor.set(head);
  cbor.set(payload, head.length);
  return cbor;
}

/**
 * `cbor`, prefixed with `prefix`, with its CRC-32, in the units of `units`. The bytes made here,
 * which hold the share's secret, are wiped once written; `cbor` too, which its caller made.
 */
function writtenCbor(units: ShareUnits, prefix: readonly number[], cbor: Uint8Array): string {
  const framed = new Uint8Array(prefix.length + cbor.length);
  framed.set(prefix);
  framed.set(cbor, prefix.length);
  const bytes = addTransportChecksum(framed);
  const values = Array.from(bytes);
  try {
    return units.text(values);
  } finally {
    for (const array of [cbor, framed, bytes, values]) array.fill(0);
  }
}

export function transportToUr(bytes: Uint8Array): string {
  shareInfo(bytes);
  // A UR's type supplies the CBOR tag. Standard Bytewords contains the tag explicitly.
  return writtenCbor(SHARE_UNITS.ur, [], canonicalCbor(bytes));
}

/**
 * A share in standard Bytewords: one English word per byte, the CBOR tag included and a new CRC32
 * over the tagged bytes, as other SSKR tools write it. bytewordsToUr reads it back.
 */
export function urToBytewords(ur: string): string {
  // A UR may carry a tag already, which is replaced by the registered one, never doubled; the
  // registered tag is written in Bytewords as other SSKR tools write it.
  return wipedAfter(urToTransport(ur), (transport) =>
    writtenCbor(SHARE_UNITS.words, tagBytes(SSKR_CBOR_TAG), canonicalCbor(transport)),
  );
}

export function bytewordsToUr(value: string): string {
  const words = bytewordUnits(value);
  if (words.length > MAX_TRANSPORT_BYTES) throw new Error("SSKR record is too long.");
  return wipedAfter(
    decodedBytes(words, SHARE_UNITS.words, "Unknown SSKR Byteword."),
    transportToUr,
  );
}

/**
 * The units of the mixed share `ur` in `form`: its word indexes or its colors (mixed-layout.ts).
 */
function mixedUnits(ur: string, form: MixedForm): number[] {
  return wipedAfter(urToTransport(ur), (transport) => {
    const mixed = mixShare(transport, form.version);
    try {
      return form.unpack(mixed);
    } finally {
      mixed.fill(0);
    }
  });
}

/**
 * The share that `values`, the units of a mixed share in `form`, hold, as its UR; refused with the
 * form's reason when they hold none (mixedTransport).
 */
/**
 * The share that `values`, units of `form`, start with: the units after its own length, such as
 * the decoys of its cards, are left out (ownUnitCount).
 */
function mixedToShare(form: MixedForm, values: readonly number[]): string {
  const own = values.slice(0, ownUnitCount(form, values) ?? values.length);
  const transport = mixedTransport(form, form.pack(own), own.length);
  if (transport === undefined) throw new Error(form.refusal);
  return wipedAfter(transport, transportToUr);
}

/** The mixed share (mixShare, version A1), zero bytes to a whole color, three bytes per #RRGGBB. */
export function shareToColors(ur: string): string[] {
  return mixedUnits(ur, COLOR_FORM).map(rgbHex);
}

/** The colors of a share as written, each as its value, in their printed order. */
function parseColorValues(value: string): number[] {
  const codes =
    value.length > MAX_COLOR_TEXT_LENGTH ? undefined : completeHexUnits(value, RGB_HEX_DIGITS);
  if (codes === undefined) throw new Error("Invalid SSKR RGB codes. Preserve their printed order.");
  return codes.map((code) => SHARE_UNITS.colors.valueOf(code)!);
}

export function colorsToShare(value: string): string {
  return mixedToShare(COLOR_FORM, parseColorValues(value));
}

/** The form of shares when none is chosen: the standard UR. */
export const DEFAULT_SHARE_FORMAT: ShareFormat = SHARE_FORMATS[0];

/** Whether `value` names a form of shares; an option or a host may pass anything. */
export function isShareFormat(value: unknown): value is ShareFormat {
  return (SHARE_FORMATS as readonly unknown[]).includes(value);
}

/**
 * Refuses `value` unless it names a form of shares, with the list of them: an option, a host or an
 * untyped caller of a writer may pass anything, such as a typo, null or a number.
 */
export function assertShareFormat(value: unknown): asserts value is ShareFormat {
  if (!isShareFormat(value))
    throw new Error(`The share format must be one of: ${SHARE_FORMATS.join(", ")}.`);
}

/** `value` as a form of shares; refused with the list of them (assertShareFormat). */
export function parseShareFormat(value: string): ShareFormat {
  assertShareFormat(value);
  return value;
}

/**
 * The form of an encoded seed phrase that each share form looks like: restoring shares shows the
 * phrase in it, and a phrase in it is split into shares of that look. Shares in Bytewords or as a
 * UR give the phrase back as words.
 */
export const MIRRORED_FORM = Object.freeze({
  ur: "english",
  words: "english",
  indexes: "indexes",
  unicode: "unicode",
  colors: "colors",
  "colors-unicode": "colors-unicode",
} as const) satisfies Readonly<Record<ShareFormat, EncodedFormat>>;

/**
 * The share form that a seed phrase in `form` is split into unless one is chosen: the one that
 * looks like it. English words give standard Bytewords rather than the UR, which other SSKR tools
 * read as well and a person reads more easily. A form that names none is refused by the encoded
 * forms' own rule (EncodedForm.of), as a host may pass anything at run time (AUD-001-API001).
 */
export function shareFormatMirroring(form: EncodedFormat): ShareFormat {
  EncodedForm.of(form);
  return SHARE_FORMATS.find((format) => format !== "ur" && MIRRORED_FORM[format] === form)!;
}

/** The share forms written in colors, as --format writes a seed phrase in colors. */
export const COLOR_SHARE_FORMATS = Object.freeze(["colors", "colors-unicode"] as const);
export type ColorShareFormat = (typeof COLOR_SHARE_FORMATS)[number];

/** Whether a share in `format` is its colors: its cards print them, not codes beside them. */
export function isColorShareFormat(format: ShareFormat): format is ColorShareFormat {
  return (COLOR_SHARE_FORMATS as readonly ShareFormat[]).includes(format);
}

/**
 * Whether shares in `format` have cards: those that look like a form of a seed phrase with cards
 * (EncodedForm cardKind), its colors or its Unicode codes. Word numbers, Bytewords and the UR have
 * none (owner, 2026-10-13). A format that names none is refused (assertShareFormat).
 */
export function shareFormatHasCards(format: ShareFormat): boolean {
  assertShareFormat(format);
  return EncodedForm.of(MIRRORED_FORM[format]).cardKind !== undefined;
}

/** Refuses cards of shares written in `format` where it has none (shareFormatHasCards). */
export function assertShareFormatHasCards(format: ShareFormat): void {
  if (!shareFormatHasCards(format))
    throw new Error(
      `Shares written as ${format} have no cards: cards print shares in colors or in Unicode codes.`,
    );
}

function indexesToShare(value: string): string {
  const numbers = codeTokens(value);
  if (numbers.some(runTogetherNumbers)) throw new Error(WORD_NUMBERS_RUN_TOGETHER);
  const indexes = numbers.map(shareWordIndex);
  if (numbers.length > MAX_COLOR_TEXT_LENGTH || indexes.some((index) => index === undefined))
    throw new Error(`Word numbers of a share are whole numbers from ${WORD_NUMBERS_THROUGH}.`);
  return mixedToShare(WORD_FORM, indexes as number[]);
}

function unicodeToShare(value: string): string {
  if (value.length > MAX_COLOR_TEXT_LENGTH)
    throw new Error("The Unicode codes of a share are too long.");
  return mixedToShare(WORD_FORM, unicodeIndexesOf(value));
}

/**
 * One share as text in `format`; readShare reads every one of them back. A format that is none is
 * refused (assertShareFormat), so that no writer gives undefined for it (AUD-001-API001).
 */
export function writeShare(share: string, format: ShareFormat): string {
  assertShareFormat(format);
  switch (format) {
    case "ur":
      return share;
    case "words":
      return urToBytewords(share);
    case "indexes":
    case "unicode":
    case "colors":
    case "colors-unicode": {
      // MnemoCode's own forms: the units of the mixed layout that the form holds.
      const { mixed, text } = SHARE_UNITS[format];
      return text(mixedUnits(share, mixed!));
    }
  }
}

/** Elements of a share in hexadecimal digits: colors, Unicode codes or Color Unicode codes. */
const HEX_ELEMENT = /^[0-9A-F]+$/u;
/** Elements of a share in Color Unicode, its codes in digits or the Private Use symbols. */
const COLOR_UNICODE_ELEMENT = new RegExp(`^[0-9A-F${COLOR_UNICODE_SYMBOL_CLASS}]+$`, "u");

/**
 * The readers of each form, with what its text looks like. Text may look like more than one form,
 * such as hexadecimal digits; each form carries a version byte, a length and a checksum, so only
 * the right reader accepts it. Each look takes the elements as the readers and the repair split
 * them (core/code-text.ts, elementsFit), so that a text that one of them reads is not turned away
 * by its look.
 */
const SHARE_READERS: readonly {
  readonly format: ShareFormat;
  readonly looks: (text: string) => boolean;
  readonly read: (text: string) => string;
  /** The list that the form's words are typed from, for the hints below a share being typed. */
  readonly words?: WordList;
}[] = [
  {
    format: "ur",
    looks: (text) => /^ur:/iu.test(text),
    read: (text) => wipedAfter(urToTransport(text), transportToUr),
  },
  { format: "indexes", looks: (text) => elementsFit(text, /^\d+$/u), read: indexesToShare },
  { format: "colors", looks: (text) => elementsFit(text, HEX_ELEMENT), read: colorsToShare },
  { format: "unicode", looks: (text) => elementsFit(text, HEX_ELEMENT), read: unicodeToShare },
  {
    format: "colors-unicode",
    looks: (text) => elementsFit(text, COLOR_UNICODE_ELEMENT),
    read: (text) => colorsToShare(unicodeToColorCodes(text).join(" ")),
  },
  // Any other text is read as Bytewords, the standard form in words.
  {
    format: "words",
    looks: (text) => text.length > 0,
    read: bytewordsToUr,
    // Hinted as bytewordUnits reads them: apart at any separator of Bytewords, or run together.
    words: new WordList({ one: "Byteword", many: "Bytewords" }, bytewords, {
      separators: BYTEWORD_SEPARATORS,
      runTogether: BYTEWORD_LETTERS,
    }),
  },
];

/**
 * The list that a share typed so far is written in the words of: Bytewords where the share looks
 * like no other form, as readShare takes it; none for a share in codes, colors or a UR.
 */
export function shareWordList(share: string): WordList | undefined {
  const text = share.trim();
  return SHARE_READERS.find((reader) => reader.looks(text))?.words;
}

/** A share in any form MnemoCode writes, as its UR, and the form it was written in. */
export function readShare(value: string): { readonly ur: string; readonly format: ShareFormat } {
  const text = value.trim();
  let firstError: unknown;
  for (const reader of SHARE_READERS) {
    if (!reader.looks(text)) continue;
    try {
      return { ur: reader.read(text), format: reader.format };
    } catch (error) {
      firstError ??= error;
    }
  }
  throw firstError instanceof Error ? firstError : new Error("This is not an SSKR share.");
}

export function normalizeShare(value: string): string {
  return readShare(value).ur;
}

/**
 * Refuses a share QR code that holds another share than the cards beside it print: the share of
 * the colors, or, where the cards print `labels`, the share's codes in another form, the share
 * that those spell.
 */
export function assertShareQr(
  colors: readonly string[],
  payload: string,
  labels?: readonly string[],
): void {
  const printed =
    labels === undefined ? colorsToShare(colors.join(" ")) : readShare(labels.join(" ")).ur;
  if (readShare(payload).ur !== printed)
    throw new Error("Share QR does not match the printed references.");
}

/**
 * Why `count` shares are not a set to read, or undefined when they may be one: none, or more than
 * a set has. A host-neutral reader that returns its trouble, such as ShareInput with no share left
 * (AUD-014-API009), says this; assertShareCount throws it.
 */
export function shareCountProblem(count: number): string | undefined {
  return Number.isSafeInteger(count) && count >= 1 && count <= MAX_SET_SHARES
    ? undefined
    : `Provide between 1 and ${MAX_SET_SHARES} SSKR shares.`;
}

/** Bound the input before parsing or searching for any missing elements (shareCountProblem). */
export function assertShareCount(count: number): void {
  const problem = shareCountProblem(count);
  if (problem !== undefined) throw new Error(problem);
}

/**
 * Reject mixed sets and duplicate members before asking the cryptographic engine: the URs of
 * Share.readSet.
 */
export function validateShareSet(records: readonly string[], requireQuorum = true): string[] {
  return Share.readSet(records, requireQuorum).map((share) => share.ur);
}

/**
 * One SSKR share, as read from any of its forms: its UR, the form it was written in, and its
 * metadata. A class, so that a share exists only once it reads, its own checks holding; it writes
 * itself in any form; it never changes; and, being part of a secret, it never shows through
 * toString, toJSON or Node.js's inspect.
 */
export class Share extends Redacted {
  readonly #ur: string;
  readonly #format: ShareFormat;
  /** Read once, with the share: every question about its set, group and member is asked of it. */
  readonly #info: ShareInfo;

  private constructor(ur: string, format: ShareFormat) {
    super("Share");
    this.#ur = ur;
    this.#format = format;
    this.#info = Object.freeze(wipedAfter(urToTransport(ur), shareInfo));
  }

  /** The forms that a share is written in (SHARE_FORMATS). */
  static readonly FORMATS: readonly ShareFormat[] = SHARE_FORMATS;

  /** Reads a share in any of its forms; throws why it cannot be read, without repeating it. */
  static read(text: string): Share {
    const { ur, format } = readShare(text);
    return new Share(ur, format);
  }

  /**
   * The shares of one set, each read in any of its forms, checked together before the SSKR
   * library sees them: as many as a set may have, none of another set, no member twice, one
   * threshold for each group, and, with `requireQuorum`, enough of them for the set's threshold.
   */
  static readSet(records: readonly string[], requireQuorum = true): Share[] {
    assertShareCount(records.length);
    const shares = records.map((record) => Share.read(record));
    const infos = shares.map((share) => share.info);
    const conflict = SetTopology.firstConflict(infos);
    if (conflict !== undefined) throw new Error(SET_CONFLICT_TEXTS[conflict.kind].refusal);
    if (requireQuorum && !new SetTopology(infos).enough) {
      throw new Error("Not enough SSKR shares to meet the recorded threshold.");
    }
    return shares;
  }

  /** Whether `text` reads as a whole share: its own checksum makes other text pass one in 2^32. */
  static reads(text: string): boolean {
    try {
      readShare(text);
      return true;
    } catch {
      return false;
    }
  }

  /** The share as its UR, ur:sskr/…, the form that the SSKR library takes. */
  get ur(): string {
    return this.#ur;
  }

  /** The form the share was written in. */
  get format(): ShareFormat {
    return this.#format;
  }

  /** What the share's metadata says: its set, its group and its member. */
  get info(): ShareInfo {
    return this.#info;
  }

  /** The share written in `format`, by default the one it was read in. */
  write(format: ShareFormat = this.#format): string {
    return writeShare(this.#ur, format);
  }

  /** Whether `other` is the same share, however either of them was written. */
  sameAs(other: Share): boolean {
    return other.#ur === this.#ur;
  }
}
