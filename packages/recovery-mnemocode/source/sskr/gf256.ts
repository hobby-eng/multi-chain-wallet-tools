import { defined } from "../core/defined.js";
import { ErrorCatalog } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("sskr.gf256", {
  "zero-no-inverse-gf-256": () => "Zero has no inverse in GF(256).",
  "shamir-points-distinct": () => "Shamir points must be distinct.",
});

// Arithmetic in GF(2^8) with the AES polynomial x^8 + x^4 + x^3 + x + 1 (0x11B), the field in
// which bc-shamir splits a secret (bc-shamir 0.13.0, hazmat.rs). A share is the value of one
// polynomial per byte at x = its member index; the secret sits at x = 255 and the digest at 254.
// Multiplying by a known constant is linear over GF(2), which lets repair.ts and joint-repair.ts
// write Shamir's interpolation as equations in the bits of marked elements.

/** The reduction polynomial of the field, with its x^8 term. */
const REDUCTION = 0x11b;
/** Nonzero elements; the powers of 3, which generates them all, fill the tables below. */
const ORDER = 255;

const EXP = new Uint8Array(2 * ORDER);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let power = 0; power < ORDER; power += 1) {
    EXP[power] = value;
    LOG[value] = power;
    // The next power of 3: value * 2 + value, reduced.
    value = (value << 1) ^ (value & 0x80 ? REDUCTION : 0) ^ value;
    value &= 0xff;
  }
  for (let power = ORDER; power < 2 * ORDER; power += 1) EXP[power] = defined(EXP[power - ORDER]);
}

/** The x at which bc-shamir keeps the secret, and the one at which it keeps the digest share. */
export const SECRET_X = 255;
/** The x at which bc-shamir keeps the digest share. */
export const DIGEST_X = 254;

/** The product of `a` and `b` in GF(256), as bc-shamir multiplies. */
export function gfMultiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : defined(EXP[defined(LOG[a]) + defined(LOG[b])]);
}

function gfInverse(a: number): number {
  if (a === 0) throw ERRORS.create("zero-no-inverse-gf-256", []);
  return defined(EXP[ORDER - defined(LOG[a])]);
}

/**
 * The Lagrange coefficients l_i(at) for the points `xs`: the value at `at` of the polynomial of
 * lowest degree through them is the sum of l_i(at) times the value at xs[i]. Equal points would
 * make bc-shamir divide by zero silently; here they are refused.
 */
export function lagrangeCoefficients(xs: readonly number[], at: number): number[] {
  if (new Set(xs).size !== xs.length) throw ERRORS.create("shamir-points-distinct", []);
  return xs.map((xi, i) =>
    xs.reduce(
      (product, xj, j) =>
        j === i ? product : gfMultiply(product, gfMultiply(at ^ xj, gfInverse(xi ^ xj))),
      1,
    ),
  );
}
