/**
 * Spreadsheet-injection guard shared by every export surface.
 *
 * A cell whose first character is one a spreadsheet treats as the start of a
 * formula is prefixed with an apostrophe so the value is imported as text.
 * Tab and carriage return are included because a leading whitespace control
 * can shift the value into the previous column before the guard is evaluated.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/u;

export function neutralizeSpreadsheetFormula(value: string): string {
  return FORMULA_LEAD.test(value) ? `'${value}` : value;
}

export type CsvValue = string | number | bigint | boolean | null;

interface CsvEncodingOptions {
  readonly alwaysQuote?: boolean;
  readonly byteOrderMark?: boolean;
  readonly finalNewline?: boolean;
}

/** Encodes one spreadsheet-safe RFC 4180-style CSV cell. */
export function encodeCsvCell(value: CsvValue, alwaysQuote = false): string {
  if (value === null) return alwaysQuote ? '""' : '';
  // Exact numeric values remain numeric; only user-controlled text receives the
  // formula guard because a legitimate negative number must keep its type.
  const text = typeof value === 'string' ? neutralizeSpreadsheetFormula(value) : String(value);
  const escaped = text.replaceAll('"', '""');
  return alwaysQuote || /[",\r\n]/u.test(text) ? `"${escaped}"` : escaped;
}

/** Encodes rows consistently across every CSV export surface. */
export function encodeCsv(rows: ReadonlyArray<ReadonlyArray<CsvValue>>, options: CsvEncodingOptions = {}): string {
  const body = rows
    .map((row) => row.map((value) => encodeCsvCell(value, options.alwaysQuote ?? false)).join(','))
    .join('\r\n');
  return `${options.byteOrderMark === false ? '' : '\uFEFF'}${body}${options.finalNewline === false ? '' : '\r\n'}`;
}
