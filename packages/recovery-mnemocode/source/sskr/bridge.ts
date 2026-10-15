// The SSKR bridge's entries as hosts call them, each argument that the generated glue narrows
// checked first. The glue (sskr-wasm/generated) passes a number to the WASM as a u8, so 256 and
// NaN arrive as 0 and 257 as 1: a supported encoding or threshold that was never asked for
// (AUD-014-API008). The bridge refuses an unsupported code itself and wipes the secret it was
// given (AUD-012-SEC001), but only a code that survives the narrowing. The checks here run before
// the glue copies the secret, the seed or the shares into the WASM's memory.
//
// Needs from the host: the bridge, loaded (runtime.ts in Node.js); a page passes its own.
// Does not: load or verify the WASM (runtime.ts), or change what the bridge returns.

import { ErrorCatalog } from "../core/error-catalog.js";
import { ByteArray } from "../core/byte-array.js";
import { wipeAll } from "../core/bits.js";
import { isRecordedQuorum } from "./share-layout.js";

const ERRORS = new ErrorCatalog("sskr.bridge", {
  "unsupported-encoding": () => UNSUPPORTED_ENCODING,
  "unsupported-group-threshold": () => UNSUPPORTED_GROUP_THRESHOLD,
  "byte-array-required": { kind: "type", text: () => "SSKR inputs must be attached byte arrays." },
  "share-text-required": { kind: "type", text: () => "SSKR shares must be text." },
  "member-quorum": () => "The SSKR member threshold and count must form a valid quorum.",
});

/** The host's narrow share engine contract, independent of its generated files or loader. */
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
    group_threshold: number,
    group_specs: Uint8Array,
    random_seed: Uint8Array,
  ): string;
  /** Shares in the chosen engine encoding, with the same ownership and refusal contract. */
  create_sskr_shares_formatted(
    secret: Uint8Array,
    group_threshold: number,
    group_specs: Uint8Array,
    random_seed: Uint8Array,
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
export const UNSUPPORTED_GROUP_THRESHOLD =
  "The SSKR group threshold must be a whole number from 0 to 255.";
/** The largest value of the u8 that the glue passes a group threshold as. */
const U8_MAX = 0xff;

/**
 * The bridge with each narrowed argument checked before it is called. A class, so that a host
 * holds one object that keeps the bridge it wraps private and that every caller takes in its
 * place (SskrBridge): an unchecked entry is not reachable through it.
 */
export class CheckedSskrBridge implements SskrBridge {
  /** A group's checked threshold/count bytes; never silently narrows host-supplied numbers. */
  static groupSpecifications(threshold: number, count: number): Uint8Array {
    if (!isRecordedQuorum(threshold, count)) throw ERRORS.create("member-quorum", []);
    return Uint8Array.of(threshold, count);
  }
  readonly #bridge: SskrBridge;
  /** The codes of the bridge's encodings: the numbers of its enum, which also maps them back. */
  readonly #encodings: readonly number[];

  constructor(bridge: SskrBridge) {
    this.#bridge = bridge;
    this.#encodings = Object.freeze(
      Object.values(bridge.ShareEncoding).filter((code) => typeof code === "number"),
    );
  }

  get ShareEncoding(): SskrBridge["ShareEncoding"] {
    return this.#bridge.ShareEncoding;
  }

  create_sskr_shares(
    secret: Uint8Array,
    group_threshold: number,
    group_specs: Uint8Array,
    random_seed: Uint8Array,
  ): string {
    return this.#create(secret, group_threshold, group_specs, random_seed);
  }

  create_sskr_shares_formatted(
    secret: Uint8Array,
    group_threshold: number,
    group_specs: Uint8Array,
    random_seed: Uint8Array,
    encoding: number,
  ): string {
    this.#assertEncoding(encoding);
    return this.#create(secret, group_threshold, group_specs, random_seed, encoding);
  }

  recover_sskr_shares(records: string): Uint8Array {
    CheckedSskrBridge.#assertRecords(records);
    return this.#bridge.recover_sskr_shares(records);
  }

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
      if (!ByteArray.is(input)) throw ERRORS.create("byte-array-required", []);
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
    if (!Number.isInteger(threshold) || (threshold as number) < 0 || (threshold as number) > U8_MAX)
      throw ERRORS.create("unsupported-group-threshold", []);
  }
}
