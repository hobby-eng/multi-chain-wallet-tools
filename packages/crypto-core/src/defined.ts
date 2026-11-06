// From MnemoCode TS 0.1.0 (MIT), core/defined.ts: wallet-tools keeps its own copy since
// MnemoCode moved to Rust and its pages use its WebAssembly.
// A value that the code holds to be there where TypeScript cannot tell: an element at an index
// within its array, or the entry of a map that the code has just set (TS-03, in place of the
// non-null assertion). A missing one is a fault of the page, never of its input, and stops the
// operation with an error instead of going on with undefined.
//
// Host-neutral: it takes only the shared error catalog, which imports nothing.

import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.defined", {
  "missing-value": () => MISSING_VALUE,
});

/** What a value that the code holds to be there but is not says: a fault of the page. */
const MISSING_VALUE = "The page expected a value that is not there: this is a fault of the page.";

/**
 * `value`, which the code holds to be there; throws MISSING_VALUE where it is undefined or null
 * (core.defined.missing-value).
 */
export function defined<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw ERRORS.create("missing-value", []);
  return value;
}
