/** A refused number of rows in an embedded child wallet. */
export class EmbeddedDerivationError extends Error {
  readonly code = "derivation.embedded.count";
  constructor() {
    super("derivation.embedded.count");
    this.name = "EmbeddedDerivationError";
  }
}

/** The bounded child-wallet operation, shared by native field limits and pre-seed admission. */
export class EmbeddedDerivation {
  static readonly #maximumRows = 200;
  /** Maximum rows per branch; worker batches are separately bounded by DerivationStream. */
  static get maximumRows(): number {
    return EmbeddedDerivation.#maximumRows;
  }
  /** Refuses a fractional, empty or oversized row count before allocating private state. */
  static admit(this: void, count: number): void {
    if (!Number.isSafeInteger(count) || count < 1 || count > EmbeddedDerivation.#maximumRows)
      throw new EmbeddedDerivationError();
  }
}
