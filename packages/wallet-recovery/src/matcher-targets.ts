import { nonEmptyLines } from "@ckd/core/text-lines.js";
// The targets of the Wallet Matcher, whatever coins a build has: one target per non-empty line,
// read by the first coin that knows it (and by any other that reads the same address the same
// way), none twice. A coin brings only its recognizer and its address profiles, so an edition
// with fewer coins composes the same rule from fewer parts.
import type { NetworkName } from "@ckd/core/types.js";
import type { WalletMatcherTarget } from "./matcher-types.js";

/** The longest target line read; Hedera's 92-character key alias is the longest address here. */
const MAX_TARGET_LENGTH = 128;

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
   * UnsearchableAddressError for an address of the coin that no row can show.
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
  const allAdapters = coins.flatMap(({ addressAdapters }) => addressAdapters);
  const seen = new Set<string>();
  return values.map((value, index) => {
    // Refused before any recognizer decodes it, so that a long paste costs nothing (CORE-50).
    if (value.length > MAX_TARGET_LENGTH)
      throw new Error(`Address ${index + 1} is longer than any supported address.`);
    let recognized: RecognizedTarget | null;
    try {
      recognized = recognizedByAll(coins, value, network);
    } catch (cause) {
      if (cause instanceof UnsearchableAddressError)
        throw new Error(`Address ${index + 1}: ${cause.message}`, { cause });
      throw cause;
    }
    if (recognized === null)
      throw new Error(`Address ${index + 1} is not recognized for the selected network.`);
    if (seen.has(recognized.normalized))
      throw new Error(`Address ${index + 1} duplicates an earlier address.`);
    seen.add(recognized.normalized);
    return {
      ...recognized,
      id: `address-${index + 1}`,
      adapterIds:
        forceAllProfiles && recognized.fieldKeys === undefined && recognized.branches === undefined
          ? allAdapters
          : recognized.adapterIds,
    };
  });
}
