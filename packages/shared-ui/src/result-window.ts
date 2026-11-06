import type { DisplayMode } from "@ckd/core/types.js";

/** Display policy shared by the original and derived child wallet; counts are rows per page. */
const ROWS_PER_PAGE = { basic: 200, advanced: 24 } as const;

/** A bounded page of result rows. Empty results have start/end zero; an unusable size becomes one. */
export class ResultWindow {
  readonly #start: number;
  readonly #end: number;
  readonly #size: number;

  /** Capture the requested row range, clamping it to the last page of `total` rows. */
  constructor(total: number, requestedStart: number, requestedSize: number) {
    this.#size = Number.isSafeInteger(requestedSize) && requestedSize > 0 ? requestedSize : 1;
    const lastPageStart = total <= 0 ? 0 : Math.floor((total - 1) / this.#size) * this.#size;
    this.#start =
      total <= 0
        ? 0
        : Math.min(
            Math.max(0, Math.floor(requestedStart / this.#size) * this.#size),
            lastPageStart,
          );
    this.#end = total <= 0 ? 0 : Math.min(total, this.#start + this.#size);
  }

  /** Number of rows in the chosen display mode, independent of the wallet's derivation count. */
  static sizeFor(mode: DisplayMode): number {
    return ROWS_PER_PAGE[mode];
  }

  /** Zero-based first displayed row offset. */
  get start(): number {
    return this.#start;
  }

  /** Exclusive displayed row offset, bounded by the total row count. */
  get end(): number {
    return this.#end;
  }

  /** Admitted page capacity, in rows. */
  get size(): number {
    return this.#size;
  }
}
