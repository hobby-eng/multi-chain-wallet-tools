// From MnemoCode TS 0.1.0 (MIT), core/redacted.ts: wallet-tools keeps its own copy since
// MnemoCode moved to Rust and its pages use its WebAssembly.
// What a value that holds a secret shows of itself: only its kind. Every class whose fields hold a
// seed phrase, codes, dates, a share or a passphrase extends Redacted, so that toString, toJSON and
// Node.js's inspect cannot give the secret away, and a new such class cannot forget one of them.
// The label is passed by each class: a name read from the constructor would be mangled where a
// host minifies the code.
//
// Host-neutral: it imports nothing (test/portable-modules.test.ts).

/** The key under which Node.js's util.inspect looks for a value's own way to show itself. */
const NODE_INSPECT = Symbol.for("nodejs.util.inspect.custom");

/** A value that shows itself as "[Label: redacted]" and nothing more. */
export abstract class Redacted {
  readonly #shown: string;

  protected constructor(label: string) {
    this.#shown = `[${label}: redacted]`;
  }

  /** Fixed redacted label for string conversion, without traversing this owner's fields. */
  toString(): string {
    return this.#shown;
  }

  /** The redacted label that JSON serialization uses instead of this owner's fields. */
  toJSON(): string {
    return this.#shown;
  }

  /** The same fixed label for Node.js inspection, without revealing retained field values. */
  [NODE_INSPECT](): string {
    return this.#shown;
  }
}
