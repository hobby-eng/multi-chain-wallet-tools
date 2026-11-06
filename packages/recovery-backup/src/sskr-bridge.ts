// From MnemoCode TS 0.1.0 (MIT), sskr/bridge.ts: the SSKR panel keeps its own copy for its
// engine (packages/recovery-sskr-wasm), since MnemoCode moved to Rust.
// The SSKR bridge's entries as hosts call them, each argument that the generated glue narrows
// checked first. The glue (sskr-wasm/generated) passes a number to the WASM as a u8, so 256 and
// NaN arrive as 0 and 257 as 1: a supported encoding or threshold that was never asked for
// (AUD-014-API008). The bridge refuses an unsupported code itself and wipes the secret it was
// given (AUD-012-SEC001), but only a code that survives the narrowing. The checks here run before
// the glue copies the secret, the seed or the shares into the WASM's memory.
//
// Needs from the host: the bridge, loaded (runtime.ts in Node.js); a page passes its own.
// Does not: load or verify the WASM (runtime.ts), or change what the bridge returns.

import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { defined } from "@ckd/core/defined.js";
import { MAX_GROUP_MEMBERS, MIN_RECORDED_THRESHOLD } from "./sskr-limits.js";

const BYTE_MAX = 0xff;

function wipeAll(arrays: Iterable<Uint8Array>): void {
  for (const array of arrays) array.fill(0);
}

/** Whether a member threshold and count form a quorum that SSKR records. */
function isRecordedQuorum(threshold: number, count: number): boolean {
  return (
    Number.isSafeInteger(threshold) &&
    Number.isSafeInteger(count) &&
    threshold >= MIN_RECORDED_THRESHOLD &&
    count >= threshold &&
    count <= MAX_GROUP_MEMBERS
  );
}

const TYPED_ARRAY = defined(Reflect.getPrototypeOf(Uint8Array.prototype));
const ARRAY_NAME = defined(
  defined(Reflect.getOwnPropertyDescriptor(TYPED_ARRAY, Symbol.toStringTag)).get,
);
const VALUES = Uint8Array.prototype.values;

/** Whether `value` is an attached Uint8Array, by the intrinsic getters, never a spoofed one. */
function isByteArray(value: unknown): value is Uint8Array {
  if (!ArrayBuffer.isView(value)) return false;
  try {
    if (ARRAY_NAME.call(value) !== "Uint8Array") return false;
    // Creating the intrinsic iterator validates attachment without reading or copying bytes.
    Reflect.apply(VALUES, value, []);
    return true;
  } catch {
    return false;
  }
}

const ERRORS = new ErrorCatalog("sskr.bridge", {
  "unsupported-encoding": () => UNSUPPORTED_ENCODING,
  "unsupported-group-threshold": () => UNSUPPORTED_GROUP_THRESHOLD,
  "byte-array-required": { kind: "type", text: () => "SSKR inputs must be attached byte arrays." },
  "share-text-required": { kind: "type", text: () => "SSKR shares must be text." },
  "member-quorum": () => "The SSKR member threshold and count must form a valid quorum.",
});

/**
 * The host's narrow share engine contract, independent of its generated files or loader. Its member
 * names are the exports of the generated glue (sskr-wasm/generated), which runtime.ts passes as a
 * bridge as it is, so they keep the glue's names rather than camelCase.
 */
export interface SskrBridge {
  /** Numeric encodings and their reverse names; values come from the engine, never this adapter. */
  readonly ShareEncoding: Readonly<{
    readonly [code: number]: string;
    readonly CompactUr: number;
    readonly Bytewords: number;
  }>;
  /** Compact-UR shares; refuses invalid groups, secrets or random seeds. */
  create_sskr_shares(
    secret: Uint8Array,
    groupThreshold: number,
    groupSpecs: Uint8Array,
    randomSeed: Uint8Array,
  ): string;
  /** Shares in the chosen engine encoding, with the same ownership and refusal contract. */
  create_sskr_shares_formatted(
    secret: Uint8Array,
    groupThreshold: number,
    groupSpecs: Uint8Array,
    randomSeed: Uint8Array,
    encoding: number,
  ): string;
  /** Restores newline-separated compact-UR shares to a fresh owned secret buffer. */
  recover_sskr_shares(records: string): Uint8Array;
  /** Restores newline-separated shares in the chosen engine encoding to a fresh secret buffer. */
  recover_sskr_shares_formatted(records: string, encoding: number): Uint8Array;
}

/**
 * The bridge's own refusal of an unsupported encoding (UNSUPPORTED_ENCODING in
 * sskr-wasm/rust/src/lib.rs): a deliberate copy across the languages, so that a code refused here
 * reads as one refused there. test/aud-014-shares.test.ts keeps the two in step.
 */
export const UNSUPPORTED_ENCODING = "Unsupported SSKR share encoding.";
/** Why a group threshold is refused before the glue narrows it to a byte. */
export const UNSUPPORTED_GROUP_THRESHOLD = `The SSKR group threshold must be a whole number from 0 to ${BYTE_MAX}.`;

/**
 * The bridge with each narrowed argument checked before it is called. A class, so that a host
 * holds one object that keeps the bridge it wraps private and that every caller takes in its
 * place (SskrBridge): an unchecked entry is not reachable through it.
 */
export class CheckedSskrBridge implements SskrBridge {
  /**
   * A group's checked threshold/count bytes; never silently narrows host-supplied numbers. Throws
   * sskr.bridge.member-quorum when `threshold` of `count` shares is no quorum a recorded group can
   * have (isRecordedQuorum).
   */
  static groupSpecifications(threshold: number, count: number): Uint8Array {
    if (!isRecordedQuorum(threshold, count)) throw ERRORS.create("member-quorum", []);
    return Uint8Array.of(threshold, count);
  }
  readonly #bridge: SskrBridge;
  /** The codes of the bridge's encodings: the numbers of its enum, which also maps them back. */
  readonly #encodings: readonly number[];

  /** Wraps a loaded bridge, kept private; the codes of its encodings are read once, here. */
  constructor(bridge: SskrBridge) {
    this.#bridge = bridge;
    this.#encodings = Object.freeze(
      Object.values(bridge.ShareEncoding).filter((code) => typeof code === "number"),
    );
  }

  /** The wrapped bridge's own encoding enum, passed on as it is. */
  get ShareEncoding(): SskrBridge["ShareEncoding"] {
    return this.#bridge.ShareEncoding;
  }

  /**
   * The wrapped bridge's compact-UR shares, made from copies of the three arrays, which it wipes
   * afterwards; the caller's arrays are left unchanged and stay the caller's to wipe. Before any
   * copy it throws sskr.bridge.unsupported-group-threshold for a group
   * threshold that is not a whole number from 0 to 255, and sskr.bridge.byte-array-required (a
   * TypeError) for an input that is not an attached byte array; the bridge's own refusals pass on.
   */
  create_sskr_shares(
    secret: Uint8Array,
    groupThreshold: number,
    groupSpecs: Uint8Array,
    randomSeed: Uint8Array,
  ): string {
    return this.#create(secret, groupThreshold, groupSpecs, randomSeed);
  }

  /**
   * create_sskr_shares in the chosen encoding; first throws sskr.bridge.unsupported-encoding for a
   * code that is not one of ShareEncoding's numbers.
   */
  create_sskr_shares_formatted(
    secret: Uint8Array,
    groupThreshold: number,
    groupSpecs: Uint8Array,
    randomSeed: Uint8Array,
    encoding: number,
  ): string {
    this.#assertEncoding(encoding);
    return this.#create(secret, groupThreshold, groupSpecs, randomSeed, encoding);
  }

  /**
   * The secret that the wrapped bridge restores from newline-separated compact-UR shares, in a
   * fresh buffer that the caller owns and wipes. Throws sskr.bridge.share-text-required (a
   * TypeError) for records that are not a string; the bridge's own refusals pass on.
   */
  recover_sskr_shares(records: string): Uint8Array {
    CheckedSskrBridge.#assertRecords(records);
    return this.#bridge.recover_sskr_shares(records);
  }

  /**
   * recover_sskr_shares in the chosen encoding; first throws sskr.bridge.unsupported-encoding for a
   * code that is not one of ShareEncoding's numbers.
   */
  recover_sskr_shares_formatted(records: string, encoding: number): Uint8Array {
    this.#assertEncoding(encoding);
    CheckedSskrBridge.#assertRecords(records);
    return this.#bridge.recover_sskr_shares_formatted(records, encoding);
  }

  /** Admits every array before any copy, then owns and wipes the inputs passed to generated glue. */
  #create(
    secret: Uint8Array,
    threshold: number,
    groups: Uint8Array,
    seed: Uint8Array,
    encoding?: number,
  ): string {
    CheckedSskrBridge.#assertGroupThreshold(threshold);
    for (const input of [secret, groups, seed])
      if (!isByteArray(input)) throw ERRORS.create("byte-array-required", []);
    const owned: Uint8Array[] = [];
    try {
      for (const input of [secret, groups, seed]) owned.push(new Uint8Array(input));
      const [copy, specifications, randomness] = owned;
      // The three entries were made above; tuple construction keeps the glue inputs intrinsic.
      if (copy === undefined || specifications === undefined || randomness === undefined)
        throw ERRORS.create("byte-array-required", []);
      return encoding === undefined
        ? this.#bridge.create_sskr_shares(copy, threshold, specifications, randomness)
        : this.#bridge.create_sskr_shares_formatted(
            copy,
            threshold,
            specifications,
            randomness,
            encoding,
          );
    } finally {
      wipeAll(owned);
    }
  }

  static #assertRecords(records: unknown): void {
    if (typeof records !== "string") throw ERRORS.create("share-text-required", []);
  }

  /** Refuses anything but the code of one of the bridge's encodings, a whole number as it is. */
  #assertEncoding(encoding: unknown): void {
    if (typeof encoding !== "number" || !this.#encodings.includes(encoding))
      throw ERRORS.create("unsupported-encoding", []);
  }

  /** Refuses a group threshold that the glue's u8 would not hold as it is. */
  static #assertGroupThreshold(threshold: unknown): void {
    // The glue passes it as a u8, a byte.
    if (
      typeof threshold !== "number" ||
      !Number.isInteger(threshold) ||
      threshold < 0 ||
      threshold > BYTE_MAX
    )
      throw ERRORS.create("unsupported-group-threshold", []);
  }
}
