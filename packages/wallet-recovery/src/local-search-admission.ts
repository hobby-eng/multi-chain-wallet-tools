import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { parseConcurrency } from "@ckd/core/validation.js";

/** Local derivation jobs share this reviewed concurrency ceiling and range budget. */
export const MAX_LOCAL_SEARCH_CONCURRENCY = 5;
export const DEFAULT_LOCAL_SEARCH_CONCURRENCY = 2;
export const MAX_LOCAL_SEARCH_COUNT = 5000;

export class LocalSearchAdmission {
  /** Invalid numbers are refused; accepted requests retain the existing local job cap. */
  static concurrency(value = DEFAULT_LOCAL_SEARCH_CONCURRENCY): number {
    if (typeof value !== "number") throw new Error("Search concurrency must be a number.");
    const accepted = parseConcurrency(String(value), "Search concurrency", Number.MAX_SAFE_INTEGER);
    return Math.min(accepted, MAX_LOCAL_SEARCH_CONCURRENCY);
  }

  static range(start: number, count: number, startMax = MAX_BIP32_INDEX): void {
    if (!Number.isSafeInteger(startMax) || startMax < 0)
      throw new Error("Search maximum index must be a non-negative safe integer.");
    if (!Number.isSafeInteger(start) || start < 0)
      throw new Error("Search start must be a non-negative integer.");
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_LOCAL_SEARCH_COUNT)
      throw new Error(`Search count must be an integer from 1 to ${MAX_LOCAL_SEARCH_COUNT}.`);
    if (start > startMax || count - 1 > startMax - start)
      throw new Error(`The search range exceeds index ${startMax}.`);
  }
}
