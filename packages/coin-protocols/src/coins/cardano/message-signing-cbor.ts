// The strict subset of CBOR (RFC 8949) that CIP-8's COSE structures use, Cardano's message signing
// only: unsigned and negative integers, byte and text strings, arrays, maps keyed by integers or
// text, false, true and null, and one tag where the caller admits it (COSE_Sign1's 18). Decoding
// refuses anything else and every encoding that RFC 8949's deterministic rules (section 4.2.1) do not
// give: an argument longer than it needs, an indefinite length, map keys out of the order of their
// encodings or repeated, trailing bytes. A value has one encoding, so no reading guesses. Encoding
// writes that same deterministic form.
import { concatBytes } from "@ckd/core/crypto.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

/** A map key that COSE uses: an integer label or a text one. */
export type CborKey = number | string;

/** A decoded value; a map keeps its keys in the order of their encodings. */
export type CborValue =
  number | string | boolean | null | Uint8Array | readonly CborValue[] | CborMap;

/** A map, its entries in the order of their keys' encodings, no key repeated. */
export class CborMap {
  readonly entries: readonly (readonly [CborKey, CborValue])[];

  constructor(entries: readonly (readonly [CborKey, CborValue])[]) {
    this.entries = entries;
  }

  /** The keys, in order. */
  keys(): readonly CborKey[] {
    return this.entries.map(([key]) => key);
  }

  /** The value of `key`, or undefined when the map has none. */
  get(key: CborKey): CborValue | undefined {
    return this.entries.find(([own]) => own === key)?.[1];
  }
}

const ERRORS = new ErrorCatalog("cardano.cbor", {
  truncated: { kind: "range", text: () => "The CBOR item ends before its declared length." },
  trailing: { kind: "range", text: () => "Bytes follow the CBOR item." },
  form: {
    kind: "range",
    text: () => "The CBOR item is not in its deterministic form (RFC 8949 section 4.2.1).",
  },
  type: { kind: "type", text: () => "The CBOR item has a type that CIP-8 does not use here." },
  key: { kind: "type", text: () => "A CBOR map key is neither an integer nor text." },
  order: { kind: "range", text: () => "CBOR map keys are repeated or out of order." },
  depth: { kind: "range", text: () => "The CBOR item is nested too deeply." },
  tag: { kind: "range", text: () => "The CBOR item has a tag that is not admitted here." },
  text: { kind: "type", text: () => "A CBOR text string is not UTF-8." },
});

const CODES = [
  "truncated",
  "trailing",
  "form",
  "type",
  "key",
  "order",
  "depth",
  "tag",
  "text",
] as const;

/** Whether `cause` is one of this codec's refusals, such as cardano.cbor.order. */
export function isCborError(cause: unknown): boolean {
  return ERRORS.matches(cause, CODES);
}

/** COSE's structures nest three levels; eight leaves room and bounds a hostile input. */
const MAX_DEPTH = 8;
const MAJOR = Object.freeze({ unsigned: 0, negative: 1, bytes: 2, text: 3, array: 4, map: 5 });
const TAG_MAJOR = 6;
const SIMPLE_MAJOR = 7;
const SIMPLE = Object.freeze({ false: 20, true: 21, null: 22 });
/** The additional information of a one-, two-, four- and eight-byte argument. */
const ARGUMENT_BYTES: Readonly<Record<number, number>> = Object.freeze({
  24: 1,
  25: 2,
  26: 4,
  27: 8,
});
const IMMEDIATE_LIMIT = 24;
/** UTF-8 that keeps a leading byte order mark, so that no two encodings read as one text. */
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The smallest argument that each length of argument may hold in the deterministic form. */
function shortestFloor(bytes: number): number {
  return bytes === 1 ? IMMEDIATE_LIMIT : 2 ** (8 * (bytes / 2));
}

/** Reads one item at a time from `bytes`, refusing what the subset excludes. */
class Reader {
  readonly #bytes: Uint8Array;
  #at = 0;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
  }

  get done(): boolean {
    return this.#at === this.#bytes.length;
  }

  /** Refuses a count of items that the bytes left cannot hold, before anything is allocated. */
  #fits(items: number, bytesEach: number): void {
    if (items * bytesEach > this.#bytes.length - this.#at) throw ERRORS.create("truncated", []);
  }

  #take(length: number): Uint8Array {
    if (length > this.#bytes.length - this.#at) throw ERRORS.create("truncated", []);
    const out = this.#bytes.subarray(this.#at, this.#at + length);
    this.#at += length;
    return out;
  }

  /** The major type and the argument of the next head, refused unless shortest and definite. */
  #head(): { major: number; argument: number; info: number } {
    const initial = this.#take(1)[0] ?? 0;
    const major = initial >> 5;
    const info = initial & 0b1_1111;
    if (info < IMMEDIATE_LIMIT) return { major, argument: info, info };
    const length = ARGUMENT_BYTES[info];
    // 28 to 30 are reserved; 31 is an indefinite length or a break.
    if (length === undefined) throw ERRORS.create(info === 31 ? "form" : "type", []);
    let argument = 0;
    for (const byte of this.#take(length)) argument = argument * 256 + byte;
    if (major !== SIMPLE_MAJOR && argument < shortestFloor(length)) throw ERRORS.create("form", []);
    if (!Number.isSafeInteger(argument)) throw ERRORS.create("type", []);
    return { major, argument, info };
  }

  /** The next item; `tags` are the tags admitted around it, at this level only. */
  item(depth: number, tags: readonly number[] = []): CborValue {
    if (depth > MAX_DEPTH) throw ERRORS.create("depth", []);
    const { major, argument, info } = this.#head();
    switch (major) {
      case MAJOR.unsigned:
        return argument;
      case MAJOR.negative:
        return -1 - argument;
      case MAJOR.bytes:
        return this.#take(argument).slice();
      case MAJOR.text:
        try {
          return UTF8.decode(this.#take(argument));
        } catch (cause) {
          if (ERRORS.matches(cause, ["truncated"])) throw cause;
          throw ERRORS.create("text", [], { cause });
        }
      case MAJOR.array:
        this.#fits(argument, 1);
        return Array.from({ length: argument }, () => this.item(depth + 1));
      case MAJOR.map:
        return this.#map(argument, depth);
      case TAG_MAJOR:
        if (!tags.includes(argument)) throw ERRORS.create("tag", []);
        return this.item(depth + 1);
      default:
        return this.#simple(info);
    }
  }

  #map(count: number, depth: number): CborMap {
    this.#fits(count, 2);
    const entries: (readonly [CborKey, CborValue])[] = [];
    let previous: Uint8Array | undefined;
    for (let entry = 0; entry < count; entry += 1) {
      const start = this.#at;
      const key = this.item(depth + 1);
      if (typeof key !== "number" && typeof key !== "string") throw ERRORS.create("key", []);
      const encoded = this.#bytes.subarray(start, this.#at);
      if (previous !== undefined && compareBytes(previous, encoded) >= 0)
        throw ERRORS.create("order", []);
      previous = encoded;
      entries.push([key, this.item(depth + 1)]);
    }
    return new CborMap(entries);
  }

  /** false, true or null; floats, undefined and the other simple values are refused. */
  #simple(info: number): CborValue {
    if (info === SIMPLE.false) return false;
    if (info === SIMPLE.true) return true;
    if (info === SIMPLE.null) return null;
    throw ERRORS.create("type", []);
  }
}

/** Orders encodings as RFC 8949's deterministic maps order keys: bytewise, shorter first. */
function compareBytes(first: Uint8Array, second: Uint8Array): number {
  const length = Math.min(first.length, second.length);
  for (let at = 0; at < length; at += 1) {
    const difference = (first[at] ?? 0) - (second[at] ?? 0);
    if (difference !== 0) return difference;
  }
  return first.length - second.length;
}

/**
 * The one CBOR item of `bytes`, in the subset and its deterministic form; `tags` are the tags
 * admitted around it, such as COSE_Sign1's 18, and none deeper.
 */
export function decodeCbor(bytes: Uint8Array, tags: readonly number[] = []): CborValue {
  const reader = new Reader(bytes);
  const value = reader.item(0, tags);
  if (!reader.done) throw ERRORS.create("trailing", []);
  return value;
}

/** A head in its shortest form. */
function head(major: number, argument: number): Uint8Array {
  if (!Number.isSafeInteger(argument) || argument < 0) throw ERRORS.create("type", []);
  if (argument < IMMEDIATE_LIMIT) return Uint8Array.of((major << 5) | argument);
  for (const [info, length] of Object.entries(ARGUMENT_BYTES)) {
    if (argument >= 2 ** (8 * length)) continue;
    const out = new Uint8Array(1 + length);
    out[0] = (major << 5) | Number(info);
    let rest = argument;
    for (let at = length; at >= 1; at -= 1) {
      out[at] = rest % 256;
      rest = Math.floor(rest / 256);
    }
    return out;
  }
  throw ERRORS.create("type", []);
}

/** The deterministic encoding of `value`; a map's entries are written in their keys' order. */
export function encodeCbor(value: CborValue): Uint8Array {
  if (value === false || value === true)
    return Uint8Array.of((SIMPLE_MAJOR << 5) | (value ? SIMPLE.true : SIMPLE.false));
  if (value === null) return Uint8Array.of((SIMPLE_MAJOR << 5) | SIMPLE.null);
  if (typeof value === "number")
    return value >= 0 ? head(MAJOR.unsigned, value) : head(MAJOR.negative, -1 - value);
  if (typeof value === "string") {
    const text = new TextEncoder().encode(value);
    return concatBytes(head(MAJOR.text, text.length), text);
  }
  if (value instanceof Uint8Array) return concatBytes(head(MAJOR.bytes, value.length), value);
  if (value instanceof CborMap) {
    const entries = value.entries
      .map(([key, item]) => [encodeCbor(key), encodeCbor(item)] as const)
      .sort(([first], [second]) => compareBytes(first, second));
    return concatBytes(head(MAJOR.map, entries.length), ...entries.flat());
  }
  return concatBytes(head(MAJOR.array, value.length), ...value.map(encodeCbor));
}
