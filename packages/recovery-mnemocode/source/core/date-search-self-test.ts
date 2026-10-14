// The self-test of forgotten dates (core/dates.ts, core/date-search.ts): how many dates a typed
// pattern stands for (a ? for a digit, a lone ? for a part or for a whole date, values joined by
// |), the patterns that are refused, the search of the published Seedshift vector over the digit
// it forgot, and, with the host's master fingerprint, the date search that the wallet decides.
// core/self-test.ts runs the quick part before every command of the command line and all of it in
// the full self-test.
//
// From the host it needs, for the full check only, the master fingerprint of a phrase. It holds
// public test data, no secret.
//
// Host-neutral: it imports only other core modules.

import { dateRecoveryCandidates } from "./date-recovery.js";
import { DatesAnswer, DateSearch } from "./date-search.js";
import { formatDate } from "./dates.js";
import { expectRefused, expectSame } from "./self-test-check.js";
import { fingerprintWalletCheck, type PhraseFingerprint } from "./wallet-check.js";
import { defined } from "./defined.js";

const PUBLIC_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
/** Its master fingerprint (vectors/mnemocode-v1.json, direct-12, sourceFingerprint). */
const PUBLIC_FINGERPRINT = "73c5da0a";
/**
 * The public phrase masked with MnemoCode Seedshift and 23-09-2026, as word numbers counted from 1
 * (vectors/mnemocode-v1.json, checksum-valid-seedshift-12).
 */
const MASKED_NUMBERS = [2027, 10, 24, 2027, 10, 24, 2027, 10, 24, 2027, 10, 377] as const;
const MASKED_INDEXES = MASKED_NUMBERS.map((number) => number - 1);
const MASKED_DATE = "23-09-2026";
/** The masked phrase's date with its last digit forgotten. */
const FORGOTTEN_LAST_DIGIT = "23-09-202?";
/** A phrase of twelve words takes four dates, one for every three words. */
const TWELVE_WORDS = { wordCount: 12, patterns: true } as const;

/** The public phrase of 24 words, all-zero entropy. */
const PUBLIC_24_WORDS = `${"abandon ".repeat(23)}art`;
/**
 * Eight dates, the most that 24 words take, with the day of the latest forgotten: that day moves
 * only the last word, and MnemoCode Seedshift adds it to the last 3 bits of entropy alone, so
 * days 01 and 09 give the same phrase. The independent oracle of the AUD-010 audit
 * (docs/audits/AUD-010-harnesses/core-date-dedupe.ts) gives 8 phrases for its 9 combinations.
 */
const LATEST_DAY_FORGOTTEN =
  "01-01-2001 01-01-2002 01-01-2003 01-01-2004 01-01-2005 01-01-2006 01-01-2007 0?-12-2030";
/**
 * The public 24-word phrase masked with MnemoCode Seedshift and those dates, the latest
 * 09-12-2030, as word numbers counted from 1; the search below must give the phrase back.
 */
const LATEST_DAY_MASKED = [
  2002, 2, 2, 2003, 2, 2, 2004, 2, 2, 2005, 2, 2, 2006, 2, 2, 2007, 2, 2, 2008, 2, 2, 2031, 13, 304,
] as const;
/** The masked phrase's date, and the same date 2,048 years later: the same shift. */
const YEAR_AND_2048_LATER = "23-09-2026|4074";

/**
 * Typed dates and the combinations they stand for, counted independently with Python's datetime:
 * a ? for each forgotten digit, a lone ? for a whole part, values joined by |, a complete date
 * beside one with ?, and two dates of the same pattern, which count once in either order
 * (n × (n + 1) / 2 for n dates). These are quick enough for every start.
 */
const QUICK_COMBINATIONS: readonly (readonly [string, number])[] = [
  [FORGOTTEN_LAST_DIGIT, 10],
  ["?-09-2026", 30],
  ["05|15-09-2026", 2],
  [`${FORGOTTEN_LAST_DIGIT} ${FORGOTTEN_LAST_DIGIT}`, 55],
  [`10-07-1963 ${FORGOTTEN_LAST_DIGIT}`, 10],
];
/**
 * Patterns that take some milliseconds each to read, for the full self-test only, with a lone ?
 * for a date of which nothing is remembered: every date from 01-01-0001 to 31-12-9999, which takes
 * some tenths of a second.
 */
const SLOW_COMBINATIONS: readonly (readonly [string, number])[] = [
  ["2?-0?-19??", 8_924],
  ["29-02-????", 2_424],
  ["?-?-200? ?-?-200?", 6_674_031],
  ["?", 3_652_059],
];

/** Typed dates that must be refused, and why. */
const REFUSED_DATES: readonly (readonly [string, RegExp])[] = [
  ["23-09-26", /four-digit year/u],
  ["31-02-202?", /real calendar date/u],
  ["32-0?-2026", /valid day/u],
  ["23-1?-202", /DD-MM-YYYY/u],
  // Three dates of the 2000s with a lone ? for the day and the month: 8,131,194,435 combinations.
  ["?-?-200? ?-?-200? ?-?-200?", /safety limit/u],
  ["01-01-2001 02-01-2001 03-01-2001 04-01-2001 05-01-2001", /at most 4 dates/u],
];

/** The combinations of each of `patterns`, as DatesAnswer counts them. */
function checkCombinations(patterns: readonly (readonly [string, number])[]): void {
  for (const [typed, combinations] of patterns)
    expectSame(
      DatesAnswer.parse(typed, TWELVE_WORDS).combinations,
      combinations,
      `Date pattern ${typed} combinations`,
    );
}

/**
 * The quick known answers: the combinations of each pattern, the refusals, and the search of the
 * masked phrase over its forgotten digit, of which only 23-09-2026 gives the public phrase.
 */
export function checkDateSearchStartup(): void {
  checkCombinations(QUICK_COMBINATIONS);
  for (const [typed, because] of REFUSED_DATES)
    expectRefused(
      () => DatesAnswer.parse(typed, TWELVE_WORDS),
      because,
      `The date pattern ${typed}`,
    );
  expectRefused(
    () => DatesAnswer.parse(FORGOTTEN_LAST_DIGIT, { wordCount: 12, patterns: false }),
    /type every date in full/u,
    "A forgotten digit where dates are not searched",
  );
  const dates = DatesAnswer.parse(FORGOTTEN_LAST_DIGIT, TWELVE_WORDS);
  dates.assertIncomplete();
  expectRefused(
    () => DatesAnswer.parse(MASKED_DATE, TWELVE_WORDS).assertIncomplete(),
    /At least one date must contain a forgotten digit/u,
    "Standalone date recovery with no incomplete date",
  );
  let combinations = 0;
  const found: string[] = [];
  for (const candidates of dateRecoveryCandidates(
    MASKED_INDEXES,
    dates.known,
    dates.patterns,
    "seedshift",
  )) {
    combinations += 1;
    for (const candidate of candidates)
      if (candidate.mnemonic === PUBLIC_MNEMONIC)
        found.push(defined(candidate.dates.map(formatDate)[0]));
  }
  expectSame(combinations, 10, "Date search combinations");
  expectSame(found.join(" "), MASKED_DATE, "Date search of the Seedshift vector");
  checkShiftsTriedOnce();
}

/**
 * Each effective shift is tried once (dateRecoveryCandidates): a year 2,048 years later, and a
 * latest day that moves the last word only in part, give no phrase a second time.
 */
function checkShiftsTriedOnce(): void {
  const searched = (indexes: readonly number[], typed: string, wordCount: 12 | 24) => {
    const dates = DatesAnswer.parse(typed, { wordCount, patterns: true });
    let combinations = 0;
    const phrases: string[] = [];
    const found: string[] = [];
    for (const candidates of dateRecoveryCandidates(
      indexes,
      dates.known,
      dates.patterns,
      "seedshift",
    )) {
      combinations += 1;
      for (const candidate of candidates) {
        phrases.push(candidate.mnemonic);
        if (candidate.mnemonic === (wordCount === 12 ? PUBLIC_MNEMONIC : PUBLIC_24_WORDS))
          found.push(candidate.dates.map(formatDate).join(" "));
      }
    }
    return { combinations, phrases: phrases.length, found: found.join(" ") };
  };
  const years = searched(MASKED_INDEXES, YEAR_AND_2048_LATER, 12);
  expectSame(years.combinations, 2, "Date search combinations of a year and 2,048 years later");
  expectSame(years.phrases, 1, "Date search phrases of a year and 2,048 years later");
  expectSame(years.found, MASKED_DATE, "Date search of a year and 2,048 years later");
  const latest = searched(
    LATEST_DAY_MASKED.map((number) => number - 1),
    LATEST_DAY_FORGOTTEN,
    24,
  );
  expectSame(latest.combinations, 9, "Date search combinations of the latest day");
  expectSame(latest.phrases, 8, "Date search phrases of the latest day");
  // 01-12-2030 is tried before 09-12-2030 and gives the same phrase.
  expectSame(latest.found, "01-12-2030", "Date search of the latest day");
}

/**
 * Every check: the quick ones, and the date search with the wallet, which the host's master
 * fingerprint tells: of the ten checksum-valid phrases, only that of 23-09-2026 is the wallet's.
 */
export async function checkDateSearch(fingerprint: PhraseFingerprint): Promise<void> {
  checkDateSearchStartup();
  checkCombinations(SLOW_COMBINATIONS);
  const result = await new DateSearch({
    indexes: MASKED_INDEXES,
    dates: DatesAnswer.parse(FORGOTTEN_LAST_DIGIT, TWELVE_WORDS),
    mode: "seedshift",
    walletCheck: fingerprintWalletCheck(fingerprint, PUBLIC_FINGERPRINT),
  }).run();
  expectSame(result.combinations, 10, "Date search combinations");
  // MnemoCode Seedshift gives a valid phrase for every date: only the wallet tells them apart.
  expectSame(result.checksumValid, 10, "Date search checksum-valid phrases");
  expectSame(result.matchCount, 1, "Date search wallet matches");
  expectSame(result.shown[0]?.dates, MASKED_DATE, "Date search dates");
  expectSame(result.shown[0]?.mnemonic, PUBLIC_MNEMONIC, "Date search phrase");
}
