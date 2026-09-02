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
