import type { DateShiftDate, DatePattern, Bip39WordCount } from "./types.js";
import { inWholeRange, integerRefusal, type WholeRange } from "./typed-number.js";

/** Seedshift shifts three words with each date: by its year, its month and its day. */
const WORDS_PER_DATE = 3;

export function maximumDates(wordCount: Bip39WordCount): number {
  return wordCount / WORDS_PER_DATE;
}

/** The refusal of more dates than a phrase of `wordCount` words takes (maximumDates). */
export function tooManyDatesMessage(wordCount: Bip39WordCount): string {
  return `${wordCount}-word phrases support at most ${maximumDates(wordCount)} dates.`;
}

/** The values that each part of a date takes: years 0001 to 9999, and days of the longest month. */
export const DATE_PARTS = Object.freeze({
  year: Object.freeze({ min: 1, max: 9999 }),
  month: Object.freeze({ min: 1, max: 12 }),
  day: Object.freeze({ min: 1, max: 31 }),
}) satisfies Readonly<Record<string, WholeRange>>;
type DatePartName = keyof typeof DATE_PARTS;

/** The digits that a part is written with: as many as its last value has, 4 for a year. */
function widthOf(name: DatePartName): number {
  return String(DATE_PARTS[name].max).length;
}

/**
 * The orders that a typed date is read in: DD-MM-YYYY, which MnemoCode writes, and YYYY-MM-DD.
 * A year always has its four digits, so that 23-09-26 is an error and never the year 23.
 */
const DATE_ORDERS = Object.freeze([
  ["day", "month", "year"],
  ["year", "month", "day"],
] as const satisfies readonly (readonly DatePartName[])[]);
/** The order in which MnemoCode writes dates. */
const WRITTEN_ORDER = DATE_ORDERS[0];
/** What separates the parts of a date. */
const PART_SEPARATOR = "-";

/** How a date is written, as the questions and refusals name it: "DD-MM-YYYY". */
export const DATE_FORMAT_TEXT = WRITTEN_ORDER.map((name) =>
  name.charAt(0).toUpperCase().repeat(widthOf(name)),
).join(PART_SEPARATOR);

/**
 * The parts of `text`, each read by `readPart` with its width, in the first order of DATE_ORDERS
 * that reads every part; undefined when none does.
 */
function readDateParts<T>(
  text: string,
  readPart: (part: string, width: number) => T | undefined,
): Readonly<Record<DatePartName, T>> | undefined {
  const parts = text.split(PART_SEPARATOR);
  if (parts.length !== WRITTEN_ORDER.length) return undefined;
  for (const order of DATE_ORDERS) {
    const read = order.map((name, index) => readPart(parts[index]!, widthOf(name)));
    if (read.every((value) => value !== undefined))
      return Object.fromEntries(order.map((name, index) => [name, read[index]!])) as Record<
        DatePartName,
        T
      >;
  }
  return undefined;
}

/** The one month whose days depend on the year, and a year of each kind, for counting by month. */
const FEBRUARY = 2;
const LEAP_YEAR = 2000;
const COMMON_YEAR = 2001;

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** The days of `month` of `year`; refused for a month that is not 1 to 12. */
export function daysInMonth(year: number, month: number): number {
  if (!inWholeRange(month, DATE_PARTS.month)) throw new Error(`There is no month ${month}.`);
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** The years in words, each with its four digits: "0001 through 9999". */
function yearRangeText(): string {
  const { min, max } = DATE_PARTS.year;
  return `${String(min).padStart(widthOf("year"), "0")} through ${max}`;
}

function assertCalendarDate(date: DateShiftDate): void {
  if (!inWholeRange(date.year, DATE_PARTS.year)) {
    throw new Error(integerRefusal("A date year", DATE_PARTS.year, yearRangeText()));
  }
  if (!inWholeRange(date.month, DATE_PARTS.month)) {
    throw new Error(integerRefusal("A date month", DATE_PARTS.month));
  }
  if (!inWholeRange(date.day, DATE_PARTS.day) || date.day > daysInMonth(date.year, date.month)) {
    throw new Error("The day is outside the selected calendar month.");
  }
}

export function parseDate(value: string): DateShiftDate {
  const date = readDateParts(value.trim(), (part, width) =>
    new RegExp(`^\\d{${width}}$`, "u").test(part) ? Number(part) : undefined,
  );
  if (date === undefined)
    throw new Error(`Use ${DATE_FORMAT_TEXT} with a four-digit year, for example 23-09-2026.`);
  assertCalendarDate(date);
  return { year: date.year, month: date.month, day: date.day };
}

/**
 * A copy of `date` that nothing can change, checked as parseDate checks a typed date: an object
 * that keeps a date must not share it with its caller, who could change it after it was checked
 * (AUD-009-FUN001), and a day the calendar does not have is refused (AUD-009-API001).
 */
export function ownedDates(dates: readonly DateShiftDate[]): readonly DateShiftDate[] {
  // Array.from reads a hole of a sparse list as a date, which ownedDate refuses; map would keep it.
  return Object.freeze(Array.from(dates, ownedDate));
}

/** A date held to the rules of a date, copied (ownedDate's rule for each of `dates` above). */
export function ownedDate(date: DateShiftDate): DateShiftDate {
  // A hole of a sparse list reaches here as undefined.
  if (typeof date !== "object" || date === null)
    throw new Error("A date must have a year, a month and a day.");
  // Copied first and the copy checked: a getter could give one value to a check and another later.
  const copy = { year: date.year, month: date.month, day: date.day };
  assertCalendarDate(copy);
  return Object.freeze(copy);
}

/** The values of one part of a pattern, copied and frozen; refused when none can be a date. */
function ownedPart(values: readonly number[], part: WholeRange, name: string) {
  // Array.from turns holes into undefined, which the check below refuses; some() would skip them.
  const copy = Array.from(values ?? []);
  if (copy.length === 0 || !copy.every((value) => inWholeRange(value, part)))
    throw new Error(`The date pattern cannot match a valid ${name}.`);
  // Each value once, in ascending order, as parseDatePattern gives them: datePatternCombinationCount
  // counts distinct dates, a value given twice would be tried twice, and the search keeps the
  // earliest dates of each shift, which it meets first only in this order.
  return Object.freeze([...new Set(copy)].sort((left, right) => left - right));
}

/**
 * A copy of `pattern` that nothing can change, held to the rules of parseDatePattern: every part
 * has values a date can have, and at least one real calendar date fits (AUD-009-FUN001, API001).
 */
export function ownedPattern(pattern: DatePattern): DatePattern {
  // A hole of a sparse list reaches here as undefined, as for ownedDate.
  if (typeof pattern !== "object" || pattern === null)
    throw new Error("A date pattern must have its years, months and days.");
  const owned: DatePattern = Object.freeze({
    key: String(pattern.key),
    years: ownedPart(pattern.years, DATE_PARTS.year, "year"),
    months: ownedPart(pattern.months, DATE_PARTS.month, "month"),
    days: ownedPart(pattern.days, DATE_PARTS.day, "day"),
  });
  if (countOf(owned) === 0) throw new Error("The date pattern cannot match a real calendar date.");
  return owned;
}

/** Whether two patterns allow the same dates: the same years, months and days. */
function sameDates(left: DatePattern, right: DatePattern): boolean {
  const same = (a: readonly number[], b: readonly number[]) => {
    const values = new Set(a);
    return values.size === new Set(b).size && b.every((value) => values.has(value));
  };
  return (
    same(left.years, right.years) && same(left.months, right.months) && same(left.days, right.days)
  );
}

/**
 * The index of the first pattern with the key of an earlier one that allows other dates, or -1.
 * The key groups patterns that allow the same dates: a count takes one pattern for each key, and
 * a search tries the dates of one key in ascending order only, so such a pattern would be counted
 * wrongly and searched incompletely.
 */
export function conflictingPatternKey(patterns: readonly DatePattern[]): number {
  return patterns.findIndex((pattern, index) => {
    const earlier = patterns.slice(0, index).find((other) => other.key === pattern.key);
    return earlier !== undefined && !sameDates(earlier, pattern);
  });
}

/** The refusal of a pattern with the key of an earlier one that allows other dates. */
export const KEY_CONFLICT = "A date pattern has the key of an earlier one that allows other dates.";

/** Why a list of dates is refused that holds none: a Seedshift needs at least one. */
export const NO_DATE = "Type at least one date.";

/**
 * Patterns that nothing can change, each held to ownedPattern, and refused when a key stands for
 * patterns that allow other dates (conflictingPatternKey). Every count and search of patterns
 * takes them through it, so that a host's own patterns are held to the rules of parsed ones
 * (AUD-012-API004).
 */
export function ownedPatterns(patterns: readonly DatePattern[]): readonly DatePattern[] {
  const owned = Array.from(patterns, ownedPattern);
  if (conflictingPatternKey(owned) >= 0) throw new Error(KEY_CONFLICT);
  return Object.freeze(owned);
}

export function formatDate(date: DateShiftDate): string {
  assertCalendarDate(date);
  return WRITTEN_ORDER.map((name) => String(date[name]).padStart(widthOf(name), "0")).join(
    PART_SEPARATOR,
  );
}

export function sortDates(dates: readonly DateShiftDate[]): DateShiftDate[] {
  return [...dates].sort(compareDates);
}

export function deriveShifts(dates: readonly DateShiftDate[], wordCount: Bip39WordCount): number[] {
  if (dates.length === 0) throw new Error(NO_DATE);
  if (dates.length > maximumDates(wordCount)) throw new Error(tooManyDatesMessage(wordCount));
  const sorted = sortDates(dates);
  sorted.forEach(assertCalendarDate);
  // Sorting makes the input date order irrelevant; years, months and days
  // remain in that fixed order when the shift sequence repeats.
  const sequence = sorted.flatMap((date) => [date.year, date.month, date.day]);
  return Array.from({ length: wordCount }, (_, index) => sequence[index % sequence.length]!);
}

/**
 * A date of which nothing is remembered, typed in its place as a lone ?, as a code that cannot be
 * read is: every date that is supported.
 */
export const WHOLE_DATE = "?";
/** What a date of which nothing is remembered stands for: "??-??-????". */
const WHOLE_DATE_PATTERN = WRITTEN_ORDER.map((name) => "?".repeat(widthOf(name))).join(
  PART_SEPARATOR,
);

/**
 * Whether a typed date is one to search: a ? for a forgotten digit, a few values of a part joined
 * by |, such as 05|15, or a lone ? for a date not remembered at all.
 */
export function isDatePattern(value: string): boolean {
  const text = value.trim();
  return text === WHOLE_DATE || /[?|]/u.test(text);
}

/**
 * The masks of one part of a date: its values joined by |, each with ? for a forgotten digit; a
 * lone ? is the whole part, such as the month of 15-?-2025.
 */
function partMasks(part: string, width: number): string[] | undefined {
  const masks = part.split("|").map((mask) => (mask === "?" ? "?".repeat(width) : mask));
  return masks.every((mask) => new RegExp(`^[0-9?]{${width}}$`, "u").test(mask))
    ? masks
    : undefined;
}

export function parseDatePattern(value: string): DatePattern {
  const typed = value.trim();
  // Each part with its values joined by |, in an order of DATE_ORDERS.
  const read = readDateParts(typed === WHOLE_DATE ? WHOLE_DATE_PATTERN : typed, partMasks);
  if (read === undefined)
    throw new Error(
      `Use ${DATE_FORMAT_TEXT} with ? for each forgotten digit, values joined by | such as 05|15, or a lone ? for a whole date.`,
    );
  if (!isDatePattern(typed))
    throw new Error("A recovery pattern must contain a ? digit, or values joined by |.");
  // The same values in another order are the same pattern: one key, so that it is searched once.
  const keyOf = (masks: readonly string[]) => [...new Set(masks)].sort().join("|");
  // Held to the rules of every pattern there, a valid value in each part and a real date.
  return ownedPattern({
    key: `${keyOf(read.year)}-${keyOf(read.month)}-${keyOf(read.day)}`,
    years: matchingDateParts(read.year, DATE_PARTS.year),
    months: matchingDateParts(read.month, DATE_PARTS.month),
    days: matchingDateParts(read.day, DATE_PARTS.day),
  });
}

/** The values that `part` takes and one of `masks` allows, each once, in order. */
function matchingDateParts(masks: readonly string[], part: WholeRange): number[] {
  const expressions = masks.map((mask) => ({
    width: mask.length,
    expression: new RegExp(`^${mask.replaceAll("?", "[0-9]")}$`, "u"),
  }));
  return Array.from({ length: part.max - part.min + 1 }, (_, index) => index + part.min).filter(
    (value) =>
      expressions.some(({ width, expression }) =>
        expression.test(String(value).padStart(width, "0")),
      ),
  );
}

/** The dates that `pattern` allows, in ascending order; refused unless it holds (ownedPattern). */
export function datePatternCandidates(pattern: DatePattern): Generator<DateShiftDate> {
  return candidatesOf(ownedPattern(pattern));
}

/** How many dates `pattern` allows; refused unless it holds (ownedPattern). */
export function datePatternCandidateCount(pattern: DatePattern): number {
  return countOf(ownedPattern(pattern));
}

/**
 * The dates of a pattern already held to its rules (ownedPattern), in ascending order: what the
 * search walks for every place, which may not check the pattern again each time.
 */
function* candidatesOf(pattern: DatePattern): Generator<DateShiftDate> {
  for (const year of pattern.years) {
    for (const month of pattern.months) {
      const maximumDay = daysInMonth(year, month);
      for (const day of pattern.days) {
        if (day <= maximumDay) yield { year, month, day };
      }
    }
  }
}

/** How many dates a pattern allows whose parts are already in range (ownedPart). */
function countOf(pattern: DatePattern): number {
  // Counted by month, not date by date: a month has the same days in every year but February,
  // which has one more in a leap year. A whole pattern holds 9,999 years, whose dates listed one
  // by one took seconds, and every start counts one (the help's example).
  const daysUpTo = (last: number) => pattern.days.filter((day) => day <= last).length;
  const years = pattern.years.length;
  const leapYears = pattern.years.filter(isLeapYear).length;
  let count = 0;
  for (const month of pattern.months) {
    if (month === FEBRUARY)
      count +=
        leapYears * daysUpTo(daysInMonth(LEAP_YEAR, month)) +
        (years - leapYears) * daysUpTo(daysInMonth(COMMON_YEAR, month));
    else count += years * daysUpTo(daysInMonth(COMMON_YEAR, month));
  }
  return count;
}

export function datePatternCombinationCount(
  patterns: readonly DatePattern[],
  stopAfter = Number.MAX_SAFE_INTEGER,
): number {
  const groups = new Map<string, { readonly pattern: DatePattern; count: number }>();
  for (const pattern of ownedPatterns(patterns)) {
    const group = groups.get(pattern.key);
    groups.set(pattern.key, { pattern, count: (group?.count ?? 0) + 1 });
  }
  let total = 1n;
  const limit = BigInt(stopAfter);
  for (const { pattern, count } of groups.values()) {
    const candidateCount = countOf(pattern);
    if (candidateCount === 0) return 0;
    let combinations = 1n;
    for (let index = 1; index <= count; index += 1) {
      combinations = (combinations * BigInt(candidateCount + index - 1)) / BigInt(index);
    }
    total *= combinations;
    if (total > limit) return stopAfter + 1;
  }
  return Number(total);
}

/**
 * For each pattern, the place of the last earlier one with its key, or undefined: the dates of one
 * key are taken in ascending order only, never an earlier date after a later one.
 */
export function sameKeyPredecessors(
  patterns: readonly DatePattern[],
): readonly (number | undefined)[] {
  return patterns.map((pattern, index) => {
    const at = patterns
      .slice(0, index)
      .map((other) => other.key)
      .lastIndexOf(pattern.key);
    return at < 0 ? undefined : at;
  });
}

/**
 * Every combination of the dates that `patterns` allow, the dates of one key in ascending order
 * only (sameKeyPredecessors), so that each set of dates comes once. They come place by place in
 * the order of compareDates: the date search of earlier shifts (EarlierShifts, date-recovery.ts)
 * relies on it, and test/date-recovery-dedupe.test.ts keeps the two in step.
 */
export function datePatternCombinations(
  patterns: readonly DatePattern[],
): Generator<readonly DateShiftDate[]> {
  const owned = ownedPatterns(patterns);
  return combinationsFrom(owned, sameKeyPredecessors(owned), 0, []);
}

/** The combinations of datePatternCombinations from the pattern at `index` on, after `selected`. */
function* combinationsFrom(
  patterns: readonly DatePattern[],
  predecessors: readonly (number | undefined)[],
  index: number,
  selected: readonly DateShiftDate[],
): Generator<readonly DateShiftDate[]> {
  if (index === patterns.length) {
    yield selected;
    return;
  }
  const predecessor = predecessors[index];
  const earlier = predecessor === undefined ? undefined : selected[predecessor];
  for (const date of candidatesOf(patterns[index]!)) {
    if (earlier !== undefined && compareDates(date, earlier) < 0) continue;
    yield* combinationsFrom(patterns, predecessors, index + 1, [...selected, date]);
  }
}

/** Earlier dates first: the order of sortDates and of datePatternCandidates. */
export function compareDates(left: DateShiftDate, right: DateShiftDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

export function expandDatePattern(pattern: DatePattern): DateShiftDate[] {
  return [...datePatternCandidates(pattern)];
}
