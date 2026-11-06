// MnemoCode's word table as its command line shows it (mnemocode table): each BIP39 word with its
// number, 1 to 2048, and the Unicode code of the character that MnemoCode's Unicode form writes for
// it. The rows, the look-ups, the numbered dictionaries and the recovery set with its guide are
// MnemoCode's (wordLookup, wordTable and RecoverySet of its WebAssembly).
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { ZipArchive } from "@ckd/export/zip-archive.js";
import { mnemocode } from "./mnemocode-engine.js";

/** How a row is looked up: by its word, its number, or its Unicode code. */
export type WordTableLookup = "word" | "index" | "unicode";
/** How a Unicode code is typed, as MnemoCode's refusal says it. */
export const UNICODE_CODE_HINT = "four hexadecimal digits, such as 5BF6";

/** One row of the table. */
export interface MappingRow {
  readonly index: number;
  readonly english: string;
  readonly unicodeHex: string;
}

/** The numbered dictionaries of `mnemocode table --format`. */
const WORD_TABLE_FORMATS = Object.freeze(["english", "chinese", "unicode", "mapping"] as const);
type WordTableFormat = (typeof WORD_TABLE_FORMATS)[number];

/** A public download, independent of any phrase or lookup input. */
export interface MnemoCodeTableExport {
  readonly text: string;
  readonly fileName: string;
  readonly mimeType: string;
}

const FORMAT_LABELS: Readonly<Record<WordTableFormat, string>> = {
  english: "Numbered English words",
  chinese: "Numbered Traditional Chinese words",
  unicode: "Chinese characters and Unicode codes",
  mapping: "Full mapping: English, Chinese and Unicode codes",
};
const GUIDE = "manual-recovery.md";
const ERRORS = new ErrorCatalog("mnemocode.word-table-export", {
  format: () => "Select a word-table export format.",
});

export const WordTable = Object.freeze({
  /** The row of `text`, read as `lookup` says; refused in MnemoCode's words. */
  lookup(lookup: WordTableLookup, text: string): MappingRow {
    using row = mnemocode().wordLookup(lookup, text);
    return { index: row.index, english: row.english, unicodeHex: row.unicodeHex };
  },
});

/** The files of MnemoCode's recovery set, by name. */
function recoverySet(): Map<string, Uint8Array> {
  using set = new (mnemocode().RecoverySet)();
  const files = new Map<string, Uint8Array>();
  for (let at = 0; at < set.count; at++) {
    const name = set.name(at);
    const bytes = set.bytes(at);
    if (name !== undefined && bytes !== undefined) files.set(name, bytes);
  }
  return files;
}

/** Owns public export choices and filenames; the table and the guide are MnemoCode's. */
export class MnemoCodeWordTableExports {
  /** Keeps the former TSV as the default alongside MnemoCode's numbered dictionaries. */
  static readonly CHOICES = Object.freeze([
    { value: "legacy", label: "Original table: English words and Unicode codes" },
    ...WORD_TABLE_FORMATS.map((value) => ({ value, label: FORMAT_LABELS[value] })),
  ]);

  /**
   * Refuses unknown selectors without coercion or echoing. The original table stays tab-separated
   * for a spreadsheet: number, English word and Unicode code, from MnemoCode's full mapping; a
   * numbered dictionary is MnemoCode's text with its columns lined up, to read and print.
   */
  static table(selection: unknown): MnemoCodeTableExport {
    const format = WORD_TABLE_FORMATS.find((format) => format === selection);
    if (selection !== "legacy" && format === undefined) throw ERRORS.create("format", []);
    if (format !== undefined)
      return {
        text: mnemocode().wordTable(format),
        fileName: `mnemocode-word-table-${format}.txt`,
        mimeType: "text/plain;charset=utf-8",
      };
    const rows = mnemocode()
      .wordTable("mapping")
      .split("\n")
      .slice(1)
      .filter((line) => line.trim() !== "")
      .map((line) => line.trim().split(/\s+/u).slice(0, 3).join("\t"));
    return {
      text: ["index\tenglish\tunicode_hex", ...rows].map((line) => `${line}\n`).join(""),
      fileName: "mnemocode-word-table.tsv",
      mimeType: "text/tab-separated-values;charset=utf-8",
    };
  }

  /** MnemoCode's guide for reading a backup by hand, carrying no wallet input. */
  static recoveryGuide(): MnemoCodeTableExport {
    const guide = recoverySet().get(GUIDE);
    return {
      text: new TextDecoder().decode(guide),
      fileName: "mnemocode-manual-recovery.md",
      mimeType: "text/markdown;charset=utf-8",
    };
  }

  /** MnemoCode's recovery set: the numbered dictionaries and the guide; no private field is read. */
  static fullSet(): Uint8Array {
    return ZipArchive.pack(Object.fromEntries(recoverySet()));
  }
}
