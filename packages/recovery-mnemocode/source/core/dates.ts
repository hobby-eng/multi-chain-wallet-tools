import type { DateShiftDate, DatePattern, Bip39WordCount } from './types.js';

export function maximumDates(wordCount: Bip39WordCount): number {
  return wordCount / 3;
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function assertCalendarDate(date: DateShiftDate): void {
  if (!Number.isInteger(date.year) || date.year < 1 || date.year > 9999) {
    throw new Error('A date year must be an integer from 0001 through 9999.');
  }
  if (!Number.isInteger(date.month) || date.month < 1 || date.month > 12) {
    throw new Error('A date month must be an integer from 1 through 12.');
  }
  if (
    !Number.isInteger(date.day) ||
    date.day < 1 ||
    date.day > daysInMonth(date.year, date.month)
  ) {
    throw new Error('The day is outside the selected calendar month.');
  }
}

export function parseDate(value: string): DateShiftDate {
  const text = value.trim();
  const dayMonthYear = /^(\d{2})-(\d{2})-(\d{4})$/u.exec(text);
  // A year always has four digits, so 23-09-26 is an error and never the year 23.
  const yearMonthDay = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
  if (dayMonthYear === null && yearMonthDay === null) {
    throw new Error('Invalid date. Use DD-MM-YYYY with a four-digit year, for example 23-09-2026.');
  }
  const match = dayMonthYear ?? yearMonthDay!;
  const date =
    dayMonthYear === null
      ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
      : { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
  assertCalendarDate(date);
  return date;
}

export function formatDate(date: DateShiftDate): string {
  assertCalendarDate(date);
  return `${String(date.day).padStart(2, '0')}-${String(date.month).padStart(2, '0')}-${String(date.year).padStart(4, '0')}`;
}

export function sortDates(dates: readonly DateShiftDate[]): DateShiftDate[] {
  return [...dates].sort(
    (left, right) => left.year - right.year || left.month - right.month || left.day - right.day,
  );
}

export function deriveShifts(dates: readonly DateShiftDate[], wordCount: Bip39WordCount): number[] {
  if (dates.length === 0) throw new Error('Enter at least one date.');
  if (dates.length > maximumDates(wordCount)) {
    throw new Error(`${wordCount}-word phrases support at most ${maximumDates(wordCount)} dates.`);
  }
  const sorted = sortDates(dates);
  sorted.forEach(assertCalendarDate);
  // Sorting makes the input date order irrelevant; years, months and days
  // remain in that fixed order when the shift sequence repeats.
  const sequence = sorted.flatMap((date) => [date.year, date.month, date.day]);
  return Array.from({ length: wordCount }, (_, index) => sequence[index % sequence.length]!);
}

export function parseDatePattern(value: string): DatePattern {
  const text = value.trim();
  const dayMonthYear = /^([0-9?]{2})-([0-9?]{2})-([0-9?]{4})$/u.exec(text);
  const yearMonthDay = /^([0-9?]{4})-([0-9?]{2})-([0-9?]{2})$/u.exec(text);
  if (dayMonthYear === null && yearMonthDay === null) {
    throw new Error(
      'Invalid date pattern. Use DD-MM-YYYY and replace each forgotten digit with ?.',
    );
  }
  if (!text.includes('?')) throw new Error('A recovery pattern must contain at least one ? digit.');
  const match = dayMonthYear ?? yearMonthDay!;
  const masks =
    dayMonthYear === null
      ? {
          year: match[1]!,
          month: match[2]!,
          day: match[3]!,
        }
      : {
          year: match[3]!,
          month: match[2]!,
          day: match[1]!,
        };
  const pattern: DatePattern = {
    key: `${masks.year}-${masks.month}-${masks.day}`,
    years: matchingDateParts(masks.year, 1, 9999),
    months: matchingDateParts(masks.month, 1, 12),
    days: matchingDateParts(masks.day, 1, 31),
  };
  if (pattern.years.length === 0) throw new Error('The date pattern cannot match a valid year.');
  if (pattern.months.length === 0) throw new Error('The date pattern cannot match a valid month.');
  if (pattern.days.length === 0) throw new Error('The date pattern cannot match a valid day.');
  if (datePatternCandidateCount(pattern) === 0)
    throw new Error('The date pattern cannot match a real calendar date.');
  return pattern;
}

function matchingDateParts(mask: string, minimum: number, maximum: number): number[] {
  const expression = new RegExp(`^${mask.replaceAll('?', '[0-9]')}$`, 'u');
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => index + minimum).filter(
    (part) => expression.test(String(part).padStart(mask.length, '0')),
  );
}

export function* datePatternCandidates(pattern: DatePattern): Generator<DateShiftDate> {
  for (const year of pattern.years) {
    for (const month of pattern.months) {
      const maximumDay = daysInMonth(year, month);
      for (const day of pattern.days) {
        if (day <= maximumDay) yield { year, month, day };
      }
    }
  }
}

export function datePatternCandidateCount(pattern: DatePattern): number {
  let count = 0;
  for (const year of pattern.years)
    for (const month of pattern.months) {
      const maximumDay = daysInMonth(year, month);
      count += pattern.days.filter((day) => day <= maximumDay).length;
    }
  return count;
}

export function datePatternCombinationCount(
  patterns: readonly DatePattern[],
  stopAfter = Number.MAX_SAFE_INTEGER,
): number {
  const groups = new Map<string, { readonly pattern: DatePattern; count: number }>();
  for (const pattern of patterns) {
    const group = groups.get(pattern.key);
    groups.set(pattern.key, { pattern, count: (group?.count ?? 0) + 1 });
  }
  let total = 1n;
  const limit = BigInt(stopAfter);
  for (const { pattern, count } of groups.values()) {
    const candidateCount = datePatternCandidateCount(pattern);
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

export function* datePatternCombinations(
  patterns: readonly DatePattern[],
  index = 0,
  selected: readonly DateShiftDate[] = [],
): Generator<readonly DateShiftDate[]> {
  if (index === patterns.length) {
    yield selected;
    return;
  }
  let previousMatchingIndex = -1;
  for (let candidateIndex = index - 1; candidateIndex >= 0; candidateIndex -= 1) {
    if (patterns[candidateIndex]!.key === patterns[index]!.key) {
      previousMatchingIndex = candidateIndex;
      break;
    }
  }
  const previousMatchingDate =
    previousMatchingIndex === -1 ? undefined : selected[previousMatchingIndex];
  for (const date of datePatternCandidates(patterns[index]!)) {
    if (previousMatchingDate !== undefined && compareDates(date, previousMatchingDate) < 0)
      continue;
    yield* datePatternCombinations(patterns, index + 1, [...selected, date]);
  }
}

function compareDates(left: DateShiftDate, right: DateShiftDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

export function expandDatePattern(pattern: DatePattern): DateShiftDate[] {
  return [...datePatternCandidates(pattern)];
}
