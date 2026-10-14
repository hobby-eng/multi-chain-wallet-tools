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

  toString(): string {
    return this.#shown;
  }

  toJSON(): string {
    return this.#shown;
  }

  [NODE_INSPECT](): string {
    return this.#shown;
  }
}
