// An encoded seed phrase before its dates: its codes as BIP39 indexes, the format they were written
// in, and the mode that masked them (core/masking.ts), with every check that needs no date, the
// fingerprint of the codes themselves (the "encoded fingerprint" that encode shows), the decoding
// with complete dates, and the codes written again in their form or as an MNC1 record. A program
// that reads or writes encoded backups takes this module and the core modules it imports
// (representations, masking, words, and record.ts for the record); it needs nothing about shares,
// cards or terminals.
//
// From the host it needs, for the encoded fingerprint only, a function that gives the BIP32 master
// fingerprint of a phrase with an empty BIP39 passphrase, at once or later: WalletEvidenceCheck's
// fingerprint or fingerprintAsync with the host's PBKDF2 (core/wallet-evidence.ts).
//
// It does not ask, print or read files; it does not settle how a typed backup is to be read, with
// its record header and the mode and form a host was given (core/backup-reading.ts does), and does
// not search dates with ? (core/date-search.ts). Its messages name places and counts, never a code.
//
// Host-neutral: it imports only @scure/bip39 and the core modules above.

import { serializeRecord } from "../record.js";
import { Masking, type MaskingMode, MissingChecksumError } from "./masking.js";
import { parseInput } from "./representations.js";
import {
  type DateShiftDate,
  type DecodedResult,
  type EncodedFormat,
  type EncodedResult,
} from "./types.js";
import { phraseOfIndexes } from "./words.js";
import { fingerprintOfValidPhrase } from "./english-words.js";
import { Redacted } from "./redacted.js";
import {
  BIP39_WORD_COUNTS,
  isBip39WordCount,
  WORD_COUNTS_TEXT,
  type Bip39WordCount,
} from "./bip39-sizes.js";
import { EncodedForm } from "./encoded-form.js";
import { refusalMessage } from "./refusal.js";
import { defined } from "./defined.js";
import { ErrorCatalog } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.encoded-backup", {
  "encoded-seed-phrase": (value0: string, value1: string, value2: string) =>
    `These are ${value0} ${value1}; an encoded seed phrase has ${value2}.`,
  "create-legacy-checksum-valid-record-select-legacy-seedshift": () =>
    "To create a legacy checksum-valid record, select legacy Seedshift and enable the checksum-word replacement.",
  "legacy-checksum-word-replacement-available-only-legacy-seedshift": () =>
    "The legacy checksum-word replacement is available only in legacy Seedshift mode.",
  "original-seedshift-valid-last-word-gives-several-phrases": () =>
    "The Original Seedshift with a valid last word gives several phrases: take its candidates.",
});

/**
 * How the codes were made: not masked, or one of the Seedshift variants (core/masking.ts).
 * @deprecated Use MaskingMode; kept because hosts such as the Deriver import it.
 */
export type EncodedMode = MaskingMode;
/** The forms that codes are written in (ENCODED_FORMATS). */
export type { EncodedFormat };

/** The start of the refusal of codes that fit no form, complete or marked (BackupReading). */
export const FIT_NO_FORM = "These codes fit no form of an encoded seed phrase";

/** The modes by the names that the menu and the help use (Masking.name). */
export const ENCODED_MODE_NAMES: Readonly<Record<MaskingMode, string>> = Object.freeze(
  Object.fromEntries(Masking.MODES.map((mode) => [mode, Masking.of(mode).name])) as Record<
    MaskingMode,
    string
  >,
);

/** What Encode makes of a seed phrase (EncodedBackup.encode), for a host to save and show. */
export interface Encoding {
  /** The codes in their form, with the mode that their record names. */
  readonly backup: EncodedBackup;
  /** What the codes hold, with a replaced last word where one was replaced. */
  readonly result: EncodedResult;
  /** The masking as asked, before any replacement of the last word. */
  readonly base: EncodedResult;
  /** For the Original Seedshift: the result with a checksum-valid last word, chosen or not. */
  readonly validLastWord?: EncodedResult | undefined;
  /** Whether that last word differs from the shifted one: only then is anything replaced. */
  readonly lastWordChanged: boolean;
  /**
   * Whether the last word was replaced: asked for, and changed; the record then names the mode that
   * keeps it.
   */
  readonly replaced: boolean;
}

/** What Encode is asked for besides the mode and the dates. */
export interface EncodeOptions {
  /** For the Original Seedshift: replace the shifted last word by one with a valid checksum. */
  readonly validLastWord?: boolean | undefined;
}

// The refusal is Masking's, which checks it (Masking.assertCodes); here too for the hosts that
// take it with the backup.
export { MissingChecksumError };

/**
 * The codes of one encoded seed phrase with their format and mode. A class pays off here: it is
 * built only by `read` or `of`, and its constructor refuses codes that no seed phrase has or that
 * their mode cannot have written, so every EncodedBackup can be decoded; it never changes
 * afterwards (`withMode` gives another); and it keeps the codes, which without Seedshift are the
 * seed phrase itself, out of toString, toJSON and Node.js's inspect.
 */
export class EncodedBackup extends Redacted {
  readonly #indexes: readonly number[];
  readonly #format: EncodedFormat;
  readonly #mode: MaskingMode;

  /**
   * Holds the codes to the rules of `of`. They are checked here, not in `of` alone: a private
   * constructor is private to TypeScript only, and a JavaScript host can call it (AUD-009-API002).
   */
  private constructor(indexes: readonly number[], format: EncodedFormat, mode: MaskingMode) {
    super("EncodedBackup");
    // A JavaScript host may pass any value; another mode would silently decode another way.
    const masking = Masking.of(mode);
    // Refuses a value that names no form, with the form's own refusal.
    const form = EncodedForm.of(format);
    // Copied first and the copy checked: Array.from turns holes into undefined, which is refused,
    // where some() alone would skip them, and a getter cannot give the check one value and the
    // copy another.
    const codes = Array.from(indexes);
    if (!isBip39WordCount(codes.length))
      throw ERRORS.create("encoded-seed-phrase", [
        `${codes.length}`,
        `${form.unit}`,
        `${WORD_COUNTS_TEXT}`,
      ]);
    masking.assertCodes(codes);
    this.#indexes = Object.freeze(codes);
    this.#format = format;
    this.#mode = mode;
  }

  /**
   * Reads codes written in `format` as the codes of a seed phrase made with `mode`. Throws why
   * they cannot be, naming places and counts only; MissingChecksumError for a checksum-keeping
   * mode.
   */
  static read(text: string, format: EncodedFormat, mode: MaskingMode): EncodedBackup {
    return EncodedBackup.of(parseInput(text, format), format, mode);
  }

  /**
   * Refuses what Encode cannot make, before any secret is read: the Original Seedshift with a
   * valid last word comes only from the Original Seedshift with its replacement (`validLastWord`),
   * which no other mode has.
   */
  static assertEncodable(mode: MaskingMode, options: EncodeOptions = {}): void {
    const masking = Masking.of(mode);
    if (!masking.encodable)
      throw ERRORS.create("create-legacy-checksum-valid-record-select-legacy-seedshift", []);
    if (options.validLastWord === true && masking.withValidLastWord === undefined)
      throw ERRORS.create("legacy-checksum-word-replacement-available-only-legacy-seedshift", []);
  }

  /**
   * Encodes `mnemonic` with `mode` and `dates`, its codes written in `format`. With
   * `validLastWord`, the Original Seedshift's shifted last word, which usually fails the checksum,
   * is replaced by one with a valid checksum, and the record then names the mode that keeps it
   * (seedshift-legacy-valid); a last word that already fits is kept, and the record stays the
   * Original Seedshift's. The command line and a page encode through it, so that both write the
   * same codes and the same record.
   */
  static encode(
    mnemonic: string,
    dates: readonly DateShiftDate[],
    format: EncodedFormat,
    mode: MaskingMode,
    options: EncodeOptions = {},
  ): Encoding {
    EncodedBackup.assertEncodable(mode, options);
    const masking = Masking.of(mode);
    masking.assertDateCount(dates.length);
    const base = masking.encode(mnemonic, dates);
    const replacement = masking.withValidLastWord;
    const validLastWord = replacement?.encode(mnemonic, dates);
    const lastWordChanged =
      validLastWord !== undefined &&
      validLastWord.shiftedIndexes.at(-1) !== base.shiftedIndexes.at(-1);
    const replaced = options.validLastWord === true && lastWordChanged;
    const result = replaced ? defined(validLastWord) : base;
    const recordMode: MaskingMode = replaced ? defined(replacement).mode : mode;
    return {
      backup: EncodedBackup.of(result.shiftedIndexes, format, recordMode),
      result,
      base,
      validLastWord,
      lastWordChanged,
      replaced,
    };
  }

  /** Codes read elsewhere, as BIP39 indexes from 0 to 2047, held to the same rules as `read`. */
  static of(indexes: readonly number[], format: EncodedFormat, mode: MaskingMode): EncodedBackup {
    return new EncodedBackup(indexes, format, mode);
  }

  /**
   * Why codes that fit no form cannot be read: as the format that their characters most likely
   * are, naming places or the count only.
   */
  static whyUnreadable(text: string): string {
    const format = EncodedForm.likely(text);
    try {
      EncodedBackup.read(text, format, "direct");
    } catch (error) {
      return refusalMessage(error);
    }
    return `${FIT_NO_FORM}.`;
  }

  /** The same codes as made with `mode`, held to the rules of `of`. */
  withMode(mode: MaskingMode): EncodedBackup {
    return EncodedBackup.of(this.#indexes, this.#format, mode);
  }

  get mode(): MaskingMode {
    return this.#mode;
  }

  get format(): EncodedFormat {
    return this.#format;
  }

  /** The codes as BIP39 indexes, 0 to 2047: 12, 15, 18, 21 or 24 of them. */
  get indexes(): readonly number[] {
    return this.#indexes;
  }

  /** How many words the seed phrase has: one code a word, as the constructor checked. */
  get words(): Bip39WordCount {
    return this.#indexes.length as Bip39WordCount;
  }

  /**
   * Whether complete dates still leave several phrases: the Original Seedshift's valid last word.
   */
  get givesSeveral(): boolean {
    return Masking.of(this.#mode).givesSeveral;
  }

  /**
   * The encoded fingerprint: the BIP32 master fingerprint of the codes read as a phrase, by
   * `fingerprintOf` (the host's, with an empty BIP39 passphrase), or undefined when they are no
   * valid BIP39 phrase, as the Original Seedshift's codes usually are not. `fingerprintOf` may
   * answer at once or with a promise, which is then handed back. Compared with the one that encode
   * showed, it shows a mistyped code before any date is typed.
   */
  fingerprint<T>(fingerprintOf: (mnemonic: string) => T): T | undefined {
    return fingerprintOfValidPhrase(phraseOfIndexes(this.#indexes), fingerprintOf);
  }

  /** The codes written in their form, as encode writes them. */
  text(): string {
    return EncodedForm.of(this.#format).codes(this.#indexes);
  }

  /** The codes as an MNC1 record, which names their mode and form (record.ts). */
  record(): string {
    return serializeRecord(this.#mode, this.#format, this.text());
  }

  /**
   * The seed phrase that the codes and the complete `dates` give, with its checksum. A mode that
   * gives several phrases (givesSeveral) is refused: `candidates` gives them.
   */
  decode(dates: readonly DateShiftDate[]): DecodedResult {
    if (this.givesSeveral)
      throw ERRORS.create("original-seedshift-valid-last-word-gives-several-phrases", []);
    return defined(Masking.of(this.#mode).undo(this.#indexes, dates)[0]);
  }

  /** Every phrase that the codes and the complete `dates` may give: one unless givesSeveral. */
  candidates(dates: readonly DateShiftDate[]): DecodedResult[] {
    return Masking.of(this.#mode).undo(this.#indexes, dates);
  }

  /**
   * The phrases of fewer words that the first codes give with `dates`, where their checksum is
   * valid: what codes typed from printed cards may be, which end with decoys and so read as a
   * longer phrase whose checksum fails (owner, 2026-10-13). None for a mode that gives several
   * phrases; a shorter start that its mode refuses is left out.
   */
  shorterPhrases(dates: readonly DateShiftDate[]): ShorterPhrase[] {
    if (this.givesSeveral) return [];
    return BIP39_WORD_COUNTS.filter((words) => words < this.words).flatMap((words) => {
      let result: DecodedResult;
      try {
        const start = EncodedBackup.of(this.#indexes.slice(0, words), this.#format, this.#mode);
        result = start.decode(dates);
      } catch {
        return [];
      }
      return result.checksumValid ? [{ words, result }] : [];
    });
  }
}

/** A phrase of fewer words that the first codes of a backup give (EncodedBackup.shorterPhrases). */
export interface ShorterPhrase {
  readonly words: Bip39WordCount;
  readonly result: DecodedResult;
}
