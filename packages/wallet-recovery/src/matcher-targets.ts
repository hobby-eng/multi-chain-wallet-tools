import { nonEmptyLines } from "@ckd/core/text-lines.js";
// The targets of the Wallet Matcher, whatever coins a build has: one target per non-empty line,
// recognized by the first coin that knows it, none twice. A coin brings only its recognizer and
// its address profiles, so an edition with fewer coins composes the same rule from fewer parts.
import type { NetworkName } from "@ckd/core/types.js";
import type { WalletMatcherTarget } from "./matcher-types.js";

/** A target as a coin recognizes it; the matcher numbers it. */
export type RecognizedTarget = Omit<WalletMatcherTarget, "id">;

/** What a coin brings to the matcher. */
export interface MatcherCoin {
  /** The target that `value` is for this coin, or null when the coin does not know it. */
  recognize(value: string, network: NetworkName): RecognizedTarget | null;
  /** Every address profile of the coin, searched for a payment address when all are forced. */
  readonly addressAdapters: readonly string[];
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
    const recognized = coins.reduce<RecognizedTarget | null>(
      (found, coin) => found ?? coin.recognize(value, network),
      null,
    );
    if (recognized === null)
      throw new Error(`Address ${index + 1} is not recognized for the selected network.`);
    if (seen.has(recognized.normalized))
      throw new Error(`Address ${index + 1} duplicates an earlier address.`);
    seen.add(recognized.normalized);
    return {
      ...recognized,
      id: `address-${index + 1}`,
      adapterIds:
        forceAllProfiles && recognized.fieldKeys === undefined
          ? allAdapters
          : recognized.adapterIds,
    };
  });
}
