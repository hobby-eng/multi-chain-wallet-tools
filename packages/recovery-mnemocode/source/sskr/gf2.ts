import { defined } from "../core/defined.js";
// Linear algebra over GF(2) with bit vectors held in bigints: bit i of a column is equation i.
// repair.ts and joint-repair.ts write every check of a share as such equations in the bits of
// its unreadable elements, and solve them here instead of trying values.

/** The index of the highest set bit; the vector must not be zero. */
function topBit(vector: bigint): number {
  return vector.toString(2).length - 1;
}

/** The sum of the `vectors` that the bits of `choice` pick: bit i picks vector i. */
export function combination(vectors: readonly bigint[], choice: bigint): bigint {
  let sum = 0n;
  vectors.forEach((vector, index) => {
    if ((choice >> BigInt(index)) & 1n) sum ^= vector;
  });
  return sum;
}

/** A vector with its companion, which records what the vector stands for. */
export interface Reduced {
  readonly vector: bigint;
  readonly companion: bigint;
}

/**
 * Vectors in echelon form, each the only one with its highest bit (its pivot), each with a
 * companion that is changed alike: the unknowns that a column combines, or the change a direction
 * makes. Every elimination here is built on it: a vector is reduced by XOR-ing in the vector of
 * the pivot at its highest bit until it is zero or no pivot holds that bit.
 */
export class PivotBasis {
  readonly #pivots = new Map<number, Reduced>();

  /** `vector` reduced by the pivots, with `companion` changed alike. */
  reduce(vector: bigint, companion = 0n): Reduced {
    let reduced = vector;
    let changed = companion;
    while (reduced !== 0n) {
      const pivot = this.#pivots.get(topBit(reduced));
      if (pivot === undefined) break;
      reduced ^= pivot.vector;
      changed ^= pivot.companion;
    }
    return { vector: reduced, companion: changed };
  }

  /**
   * Reduces `vector` and keeps the result as a pivot when it is not zero. What it reduced to: zero
   * when `vector` depends on the pivots, its companion then the combination that cancels it.
   * Frozen, as it may be the stored pivot itself, which no caller may change.
   */
  add(vector: bigint, companion = 0n): Reduced {
    const reduced = Object.freeze(this.reduce(vector, companion));
    if (reduced.vector !== 0n) this.#pivots.set(topBit(reduced.vector), reduced);
    return reduced;
  }

  /** The number of pivots: the rank of the vectors added. */
  get rank(): number {
    return this.#pivots.size;
  }

  /**
   * The pivots' vectors, in the order they were added: a basis of the span of the vectors added.
   */
  get vectors(): bigint[] {
    return [...this.#pivots.values()].map((pivot) => pivot.vector);
  }
}

/**
 * Solves A x = b over GF(2), with A given by its columns: one solution, the basis of the
 * differences between solutions (each a combination of unknowns that changes nothing), and the
 * rank; undefined when there is no solution.
 */
export function solve(
  columns: readonly bigint[],
  target: bigint,
):
  | { readonly particular: bigint; readonly free: readonly bigint[]; readonly rank: number }
  | undefined {
  // Each pivot keeps its reduced column and the unknowns it combines.
  const basis = new PivotBasis();
  const free: bigint[] = [];
  columns.forEach((column, index) => {
    const reduced = basis.add(column, 1n << BigInt(index));
    // A column that reduced to zero: this combination of unknowns changes nothing at all.
    if (reduced.vector === 0n) free.push(reduced.companion);
  });
  const rest = basis.reduce(target);
  if (rest.vector !== 0n) return undefined;
  return { particular: rest.companion, free, rank: basis.rank };
}

/**
 * Bit fields packed into one vector, the first lowest, each value cut to its width: how every
 * residual of a share is written, a row of equations per bit. Widths up to 32 bits and more are
 * masked as bigints, so a CRC32 field never overflows a JavaScript shift.
 */
export class BitFields {
  #vector = 0n;
  #width = 0n;

  /** The fields of `fields`, [value, width] pairs, packed in order. */
  static of(fields: readonly (readonly [number, number])[]): bigint {
    const packed = new BitFields();
    for (const [value, width] of fields) packed.add(value, width);
    return packed.vector;
  }

  add(value: number, width: number): void {
    const bits = BigInt(width);
    this.#vector |= (BigInt(value) & ((1n << bits) - 1n)) << this.#width;
    this.#width += bits;
  }

  get vector(): bigint {
    return this.#vector;
  }
}

/** Bytes as one bit vector, byte i at bits 8i to 8i + 7. */
export function bytesToBits(bytes: Uint8Array): bigint {
  let vector = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1)
    vector = (vector << 8n) | BigInt(defined(bytes[index]));
  return vector;
}

/** The `count` unit vectors, bit i alone in the i-th: a direction for every unknown bit. */
export function unitVectors(count: number): bigint[] {
  return Array.from({ length: count }, (_, bit) => 1n << BigInt(bit));
}

/**
 * An affine map over GF(2) at `origin`, and its change along each of `directions`, evaluated in
 * that order: the columns of its equations. Each share's own repair and the joint repair write
 * their residuals so (ReadingSpace.solve, solveJoint).
 */
export function linearize(
  map: (z: bigint) => bigint,
  origin: bigint,
  directions: readonly bigint[],
): { readonly value: bigint; readonly columns: bigint[] } {
  const value = map(origin);
  return { value, columns: directions.map((direction) => map(origin ^ direction) ^ value) };
}
