export type RandomBytes = (length: number) => Uint8Array;

/** Owns admission of injected draws; the caller owns and wipes each accepted buffer. */
export class CheckedRandomByteSource {
  readonly #source: RandomBytes;

  constructor(source: RandomBytes) {
    this.#source = source;
  }

  bytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0)
      throw new Error("Random-byte request length must be a non-negative safe integer.");
    const bytes: unknown = this.#source(length);
    if (bytes instanceof Uint8Array && bytes.length === length) return bytes;
    // Even a refused draw may contain secret entropy. Do not leave it to garbage collection.
    if (bytes instanceof Uint8Array) bytes.fill(0);
    const returned = bytes instanceof Uint8Array ? `${bytes.length} bytes` : "no Uint8Array";
    throw new Error(`Random-byte source returned ${returned}; expected ${length} bytes.`);
  }
}
