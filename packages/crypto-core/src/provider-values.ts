// The checks of the untrusted values a public provider returns: one set for every provider, each
// error naming the provider so that a person sees which one sent malformed data.
import { PROVIDER_UNSIGNED_DECIMAL } from "./numeric-limits.js";
import { requireRecord } from "./records.js";

export interface ProviderValues {
  /** An object, never an array or null. */
  record(value: unknown, context: string): Record<string, unknown>;
  /** An unsigned decimal string; a safe integer is accepted as its decimal text. */
  decimal(value: unknown, context: string, nullAsZero?: boolean): string;
  /** A safe non-negative integer, as a number or as decimal text. */
  unsignedInteger(value: unknown, context: string): number;
  /** A date the provider may leave out: null when absent, refused when unreadable. */
  timestamp(value: unknown, context: string): string | null;
}

/** The checks for the answers of `provider`, such as "Platform Explorer". */
export function providerValues(provider: string): ProviderValues {
  const invalid = (context: string): Error =>
    new Error(`${provider} returned an invalid ${context}.`);
  return {
    record: (value, context) => requireRecord(value, `${provider} returned malformed ${context}.`),
    decimal(value, context, nullAsZero = false) {
      if (nullAsZero && (value === null || value === undefined)) return "0";
      const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
      if (typeof text !== "string" || !PROVIDER_UNSIGNED_DECIMAL.test(text)) throw invalid(context);
      return text;
    },
    unsignedInteger(value, context) {
      const numeric =
        typeof value === "string" && PROVIDER_UNSIGNED_DECIMAL.test(value) ? Number(value) : value;
      if (typeof numeric !== "number" || !Number.isSafeInteger(numeric) || numeric < 0)
        throw invalid(context);
      return numeric;
    },
    timestamp(value, context) {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw invalid(context);
      return value;
    },
  };
}
