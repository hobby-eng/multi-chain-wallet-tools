import { neutralizeSpreadsheetFormula } from "./csv.js";

/** Spreadsheet-safe TSV encoding shared by bounded exports and streaming row exporters. */
export class Tsv {
  /** Collapses record/field separators and neutralizes formula leads, including header cells. */
  static row(values: readonly string[]): string {
    return values
      .map((value) => neutralizeSpreadsheetFormula(value.replace(/[\t\r\n]+/gu, " ")))
      .join("\t");
  }

  /** Encodes complete rows without adding a byte-order mark or trailing newline. */
  static table(rows: readonly (readonly string[])[]): string {
    return rows.map((row) => this.row(row)).join("\n");
  }
}
