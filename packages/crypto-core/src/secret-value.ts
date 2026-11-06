// From MnemoCode TS 0.1.0 (MIT), core/secret-value.ts: wallet-tools keeps its own copy since
// MnemoCode moved to Rust and its pages use its WebAssembly.
// Owned mutable bytes for retained text and numeric recovery state. Decoded views are temporary
// copies: JavaScript cannot erase strings, frozen arrays or copies the garbage collector made.
import { Redacted } from "./redacted.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.secret-value", {
  wiped: () => "This secret value has been wiped.",
  numbers: { kind: "type", text: () => "Secret numeric storage needs finite numbers." },
  text: { kind: "type", text: () => "Secret text storage needs text." },
  cleanup: () => "More than one operation failed while ending the secret's working state.",
  bigints: { kind: "type", text: () => "Secret integer storage needs bigint values." },
});
// IEEE754 binary64, little endian, preserves the admitted numeric values without truncation.
const NUMBER_BYTES = Float64Array.BYTES_PER_ELEMENT;
const CODE_UNIT_BYTES = Uint16Array.BYTES_PER_ELEMENT;
// Bound the argument list of String.fromCharCode independently of a host's input size.
const CODE_UNIT_CHUNK = 1024;
const ENCODER = new TextEncoder();
// A leading U+FEFF is part of a BIP39 passphrase, not a transport marker to discard.
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function encodedNumbers(values: readonly number[]): Uint8Array {
  if (!Array.isArray(values)) throw ERRORS.create("numbers", []);
  const copy = Array.from<number>(values);
  try {
    if (!copy.every((value) => typeof value === "number" && Number.isFinite(value)))
      throw ERRORS.create("numbers", []);
    const bytes = new Uint8Array(copy.length * NUMBER_BYTES);
    const view = new DataView(bytes.buffer);
    copy.forEach((value, index) => view.setFloat64(index * NUMBER_BYTES, value, true));
    return bytes;
  } finally {
    copy.fill(0);
  }
}

function decodedNumbers(bytes: Uint8Array, start: number, count: number): readonly number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      view.getFloat64((start + index) * NUMBER_BYTES, true),
    ),
  );
}

function decodedCodeUnits(view: DataView, start: number, length: number): string {
  // Keep each argument list bounded even for a host's large opaque key.
  const chunk: number[] = [];
  let text = "";
  try {
    for (let index = 0; index < length; index += 1) {
      chunk.push(view.getUint16((start + index) * CODE_UNIT_BYTES, true));
      if (chunk.length === CODE_UNIT_CHUNK || index === length - 1) {
        text += String.fromCharCode(...chunk);
        chunk.fill(0);
        chunk.length = 0;
      }
    }
    return text;
  } finally {
    chunk.fill(0);
  }
}

/**
 * `bytes`, a result made with a secret, returned while `assertLive` passes; once the secret's owner
 * has ended its lifetime, as across an await, they are overwritten and its refusal is thrown (such
 * as core.secret-value.wiped), so that no result outlives the secret that made it.
 */
export function bytesWhileLive(bytes: Uint8Array, assertLive: () => void): Uint8Array {
  try {
    assertLive();
    return bytes;
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

/**
 * One retained secret in owned Uint8Array storage, with fresh text/array views on request.
 * Factories snapshot their input. wipe/dispose are idempotent; every later read/copy is refused
 * with core.secret-value.wiped. A decoded view belongs to the caller and cannot be recalled.
 */
export class SecretValue<Value> extends Redacted implements Disposable {
  readonly #bytes: Uint8Array;
  readonly #decode: (bytes: Uint8Array) => Value;
  #wiped = false;

  private constructor(bytes: Uint8Array, decode: (bytes: Uint8Array) => Value) {
    super("SecretValue");
    this.#bytes = bytes;
    this.#decode = decode;
  }

  /**
   * Retains UTF-8 bytes, dropping the input string after construction. Refuses a value that is not
   * text (core.secret-value.text), as a JavaScript host may pass one.
   */
  static text(text: string): SecretValue<string> {
    if (typeof text !== "string") throw ERRORS.create("text", []);
    return new SecretValue(ENCODER.encode(text), (bytes) => DECODER.decode(bytes));
  }

  /**
   * Retains finite numbers in binary64 bytes; numeric meaning is checked by the domain owner.
   * Refuses a value that is not an array of finite numbers (core.secret-value.numbers), as a
   * JavaScript host may pass one.
   */
  static numbers(values: readonly number[]): SecretValue<readonly number[]> {
    const bytes = encodedNumbers(values);
    return new SecretValue(bytes, (storage) =>
      decodedNumbers(storage, 0, storage.length / NUMBER_BYTES),
    );
  }

  /**
   * Retains arbitrary signed integers without a lossy conversion through Number. Refuses a value
   * that is not an array of bigints (core.secret-value.bigints), as a JavaScript host may pass one.
   */
  static bigints(values: readonly bigint[]): SecretValue<readonly bigint[]> {
    if (!Array.isArray(values)) throw ERRORS.create("bigints", []);
    const copy = Array.from<bigint>(values);
    if (!copy.every((value) => typeof value === "bigint")) throw ERRORS.create("bigints", []);
    // Only transient decimal strings reach the existing text encoder. The retained decoder
    // captures item lengths, not these immutable values or the temporary storage owner.
    using encoded = SecretValue.texts(copy.map((value) => value.toString()));
    const decode = encoded.#decode;
    return new SecretValue(Uint8Array.from(encoded.#bytes), (bytes) =>
      Object.freeze(decode(bytes).map((value) => BigInt(value))),
    );
  }

  /**
   * Retains independent numeric lists; only their lengths are kept outside the byte storage.
   * Refuses a value that is not an array of arrays of finite numbers (core.secret-value.numbers).
   */
  static numberLists(
    values: readonly (readonly number[])[],
  ): SecretValue<readonly (readonly number[])[]> {
    if (!Array.isArray(values)) throw ERRORS.create("numbers", []);
    const rows = Array.from<readonly number[]>(values);
    const copy: number[][] = [];
    let flat: number[] = [];
    try {
      for (const row of rows) {
        if (!Array.isArray(row)) throw ERRORS.create("numbers", []);
        copy.push(Array.from<number>(row));
      }
      flat = copy.flat();
      const lengths = copy.map((values) => values.length);
      const bytes = encodedNumbers(flat);
      return new SecretValue(bytes, (storage) => {
        let start = 0;
        return Object.freeze(
          lengths.map((count) => {
            const values = decodedNumbers(storage, start, count);
            start += count;
            return values;
          }),
        );
      });
    } finally {
      for (const values of copy) values.fill(0);
      flat.fill(0);
    }
  }

  /**
   * Retains UTF-8 text items; only item lengths are kept outside the byte storage. Refuses a value
   * that is not an array of text (core.secret-value.text).
   */
  static texts(values: readonly string[]): SecretValue<readonly string[]> {
    if (!Array.isArray(values)) throw ERRORS.create("text", []);
    const encoded: Uint8Array[] = [];
    try {
      for (const text of values) {
        if (typeof text !== "string") throw ERRORS.create("text", []);
        encoded.push(ENCODER.encode(text));
      }
      const lengths = encoded.map((bytes) => bytes.length);
      const bytes = new Uint8Array(lengths.reduce((sum, length) => sum + length, 0));
      let offset = 0;
      for (const part of encoded) {
        bytes.set(part, offset);
        offset += part.length;
      }
      return new SecretValue(bytes, (storage) => {
        let start = 0;
        return Object.freeze(
          lengths.map((length) => {
            const text = DECODER.decode(storage.subarray(start, start + length));
            start += length;
            return text;
          }),
        );
      });
    } finally {
      for (const bytes of encoded) bytes.fill(0);
    }
  }

  /**
   * Retains opaque JS strings losslessly as UTF-16 code units, including lone surrogates. Refuses
   * a value that is not an array of text (core.secret-value.text).
   */
  static utf16Texts(values: readonly string[]): SecretValue<readonly string[]> {
    if (!Array.isArray(values)) throw ERRORS.create("text", []);
    const texts = Array.from<string>(values);
    if (!texts.every((text) => typeof text === "string")) throw ERRORS.create("text", []);
    const lengths = texts.map((text) => text.length);
    const bytes = new Uint8Array(
      lengths.reduce((sum, length) => sum + length, 0) * CODE_UNIT_BYTES,
    );
    const view = new DataView(bytes.buffer);
    let offset = 0;
    for (const text of texts) {
      for (let index = 0; index < text.length; index += 1) {
        view.setUint16(offset * CODE_UNIT_BYTES, text.charCodeAt(index), true);
        offset += 1;
      }
    }
    return new SecretValue(bytes, (storage) => {
      const stored = new DataView(storage.buffer, storage.byteOffset, storage.byteLength);
      let start = 0;
      return Object.freeze(
        lengths.map((length) => {
          const text = decodedCodeUnits(stored, start, length);
          start += length;
          return text;
        }),
      );
    });
  }

  /**
   * Refuses a read or publication after the owner ended the lifetime, including across an await
   * (core.secret-value.wiped).
   */
  assertLive(): void {
    if (this.#wiped) throw ERRORS.create("wiped", []);
  }

  /**
   * A freshly decoded view; the owner retains only bytes after this call returns. Refused after
   * wipe (assertLive).
   */
  get value(): Value {
    this.assertLive();
    return this.#decode(this.#bytes);
  }

  /**
   * A separate owner with its own byte copy and the same decoding contract. Refused after wipe
   * (assertLive).
   */
  copy(): SecretValue<Value> {
    this.assertLive();
    return new SecretValue(Uint8Array.from(this.#bytes), this.#decode);
  }

  /** Overwrites this owner's bytes as far as the runtime allows and refuses further reads. */
  wipe(): void {
    this.#bytes.fill(0);
    this.#wiped = true;
  }

  /**
   * Ends this value and its active local work. Clears the registry before calling its closures,
   * so reentrant disposal is harmless; every closure runs even if another one fails. One failure
   * is thrown again as it is; several are refused together (core.secret-value.cleanup), with the
   * failures as the cause.
   */
  wipeAndClose(active: Set<() => void>): void {
    this.wipe();
    const closing = [...active];
    active.clear();
    const failures: unknown[] = [];
    for (const close of closing) {
      try {
        close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw ERRORS.create("cleanup", [], { cause: Object.freeze(failures) });
  }

  /** Ends this owner's lifetime, also when a using scope exits through a failure. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
