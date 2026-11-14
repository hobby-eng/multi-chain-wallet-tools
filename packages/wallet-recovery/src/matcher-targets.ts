import { nonEmptyLines } from "@ckd/core/text-lines.js";
// The targets of the Wallet Matcher, whatever coins a build has: one target per non-empty line,
// read by the first coin that knows it (and by any other that reads the same address the same
// way), none twice. A coin brings only its recognizer and its address profiles, so an edition
// with fewer coins composes the same rule from fewer parts.
import type { NetworkName } from "@ckd/core/types.js";
import type { WalletMatcherTarget } from "./matcher-types.js";

/**
 * The longest target line read: a Zcash unified address with unrecognised items, 509 characters in
 * zcash-test-vectors' unified_address.json, is the longest address here.
 */
const MAX_TARGET_LENGTH = 512;
/**
 * The most target lines read, so that a plan's checks and its searches stay bounded (CORE-50): each
 * line is compared in every structure searched, and some cost a check of their own. The page's
 * address field says it (apps/key-derivation/src/index.html, pinned by matcher-limits.test.ts).
 */
export const MAX_MATCHER_TARGETS = 1_000;

/** A target as a coin recognizes it; the matcher numbers it. */
export type RecognizedTarget = Omit<WalletMatcherTarget, "id">;

/**
 * A coin's refusal of an address it knows but cannot search, such as a Cardano address of a script:
 * its text says why, and the matcher prefixes the line, "Address N: …".
 */
export class UnsearchableAddressError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "UnsearchableAddressError";
  }
}

/** What a coin brings to the matcher. */
export interface MatcherCoin {
  /**
   * The target that `value` is for this coin, or null when the coin does not know it; it throws an
   * UnsearchableAddressError for an address of the coin that no row can show, and so does the
   * target's check (WalletMatcherTarget.check) for one that its costly checks refuse.
   */
  recognize(value: string, network: NetworkName): RecognizedTarget | null;
  /** Every address profile of the coin, searched for a payment address when all are forced. */
  readonly addressAdapters: readonly string[];
}

/**
 * The first coin's reading of `value`; a later coin that reads the same address the same way (an
 * address both Ethereum and Ethereum Classic use) adds its address profiles to it.
 */
function recognizedByAll(
  coins: readonly MatcherCoin[],
  value: string,
  network: NetworkName,
): RecognizedTarget | null {
  const readings = coins.flatMap((coin) => coin.recognize(value, network) ?? []);
  const [first, ...others] = readings;
  if (first === undefined) return null;
  const same = others.filter(
    (found) =>
      found.normalized === first.normalized &&
      found.fieldKeys === undefined &&
      first.fieldKeys === undefined,
  );
  return same.length === 0
    ? first
    : {
        ...first,
        adapterIds: [...new Set([first, ...same].flatMap(({ adapterIds }) => adapterIds))],
      };
}

/** `run`'s result; a refusal of an address it knows (UnsearchableAddressError) names its line. */
function onLine<T>(place: number, run: () => T): T {
  try {
    return run();
  } catch (cause) {
    if (cause instanceof UnsearchableAddressError)
      throw new Error(`Address ${place}: ${cause.message}`, { cause });
    throw cause;
  }
}

/**
 * The targets of `input` for `coins`. A forced search tries a payment address with every address
 * profile of the build's coins; a target compared by its fields keeps its own.
 */
export function detectMatcherTargets(
  input: string,
  network: NetworkName,
  forceAllProfiles: boolean,
  coins: readonly MatcherCoin[],
): WalletMatcherTarget[] {
  const values = nonEmptyLines(input);
  if (values.length === 0) throw new Error("Enter at least one known address.");
  if (values.length > MAX_MATCHER_TARGETS)
    throw new Error(
      `Enter at most ${MAX_MATCHER_TARGETS.toLocaleString("en-US")} known addresses.`,
    );
  const allAdapters = coins.flatMap(({ addressAdapters }) => addressAdapters);
  const seen = new Set<string>();
  return values.map((value, index) => {
    // Refused before any recognizer decodes it, so that a long paste costs nothing (CORE-50).
    if (value.length > MAX_TARGET_LENGTH)
      throw new Error(`Address ${index + 1} is longer than any supported address.`);
    const recognized = onLine(index + 1, () => recognizedByAll(coins, value, network));
    if (recognized === null)
      throw new Error(`Address ${index + 1} is not recognized for the selected network.`);
    if (seen.has(recognized.normalized))
      throw new Error(`Address ${index + 1} duplicates an earlier address.`);
    seen.add(recognized.normalized);
    const { check } = recognized;
    const widened =
      forceAllProfiles &&
      recognized.fieldKeys === undefined &&
      recognized.branches === undefined &&
      recognized.ownership === undefined;
    return {
      ...recognized,
      ...(check === undefined ? {} : { check: () => onLine(index + 1, check) }),
      id: `address-${index + 1}`,
      adapterIds: widened ? allAdapters : recognized.adapterIds,
      ...(widened ? { coinAdapterIds: recognized.adapterIds } : {}),
    };
  });
}
