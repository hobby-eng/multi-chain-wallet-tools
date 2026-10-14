import { unicodeCodesOfIndexes, wordsOfIndexes } from "./words.js";
import { formatDate } from "./dates.js";
import {
  ENCODED_FORMATS,
  type DateShiftDate,
  type EncodedFormat,
  type EncodedResult,
  type OutputFormat,
} from "./types.js";
import { wordNumberOf, isBip39WordCount } from "./bip39-sizes.js";
import { EncodedForm } from "./encoded-form.js";

/**
 * The result of encoding the phrase of `words` into `shiftedIndexes` with `dates` and their
 * `shifts`: the phrase, its shifted word numbers with their English words and Unicode codes, the
 * dates and the shifts.
 */
export function resultFromIndexes(
  words: readonly string[],
  shiftedIndexes: readonly number[],
  dates: readonly DateShiftDate[],
  shifts: readonly number[],
): EncodedResult {
  return {
    sourceMnemonic: words.join(" "),
    shiftedIndexes,
    shiftedEnglish: wordsOfIndexes(shiftedIndexes),
    unicodeCodePoints: unicodeCodesOfIndexes(shiftedIndexes),
    dates,
    shifts,
  };
}

/** The BIP39 indexes of codes written in `format` (EncodedForm.read). */
export function parseInput(value: string, format: EncodedFormat): number[] {
  return EncodedForm.of(format).read(value);
}

/** Returns every raw representation parser that accepts a complete standard-length record. */
export function detectInputFormats(value: string): Array<EncodedFormat> {
  return ENCODED_FORMATS.filter((format) => {
    try {
      const indexes = parseInput(value, format);
      return isBip39WordCount(indexes.length);
    } catch {
      return false;
    }
  });
}

/**
 * The codes of `result` in `format` (EncodedForm.write), or JSON with every form and the shifts.
 * Every form in the JSON is written from the indexes too, as EncodedForm writes each, so that the
 * JSON and the text of one result cannot disagree, whatever its stored words say (AUD-014-API007).
 */
export function formatEncoded(result: EncodedResult, format: OutputFormat): string {
  if (format !== "json") return EncodedForm.of(format).write(result);
  const indexes = result.shiftedIndexes;
  return JSON.stringify(
    {
      algorithm: "Seedshift-compatible date shift",
      dates: result.dates.map(formatDate),
      shifts: result.shifts,
      english: wordsOfIndexes(indexes),
      indexes: indexes.map(wordNumberOf),
      unicodeCodePoints: EncodedForm.of("unicode").codes(indexes),
    },
    null,
    2,
  );
}
