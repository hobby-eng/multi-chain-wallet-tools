// A value that the code holds to be there where TypeScript cannot tell: an element at an index
// within its array, or the entry of a map that the code has just set (TS-03, in place of the
// non-null assertion). A missing one is a fault of MnemoCode, never of its input, and stops the
// operation with an error instead of going on with undefined.
//
// Host-neutral: it takes only the shared error catalog, which imports nothing.

import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.defined", {
  "missing-value": () => MISSING_VALUE,
});

/** What a value that the code holds to be there but is not says: a fault of MnemoCode. */
export const MISSING_VALUE =
  "MnemoCode expected a value that is not there: this is a fault of MnemoCode.";

/**
 * `value`, which the code holds to be there; throws MISSING_VALUE where it is undefined or null.
 */
export function defined<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw ERRORS.create("missing-value", []);
  return value;
}
