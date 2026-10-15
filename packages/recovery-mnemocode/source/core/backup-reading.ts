// How a backup that a person types, pastes or reads from a file is to be read, before its dates:
// its MNC1 record header, if it has one (record.ts); a record without Seedshift where only a
// Seedshift backup will do; a Shamir share given where an encoded seed phrase was asked for; the
// mode, from the record or from the host, and what to say when the two differ; the form of the
// codes, from the record, from the host, or every form that fits; and then the codes themselves
// (EncodedBackup, core/encoded-backup.ts). The command line and a page ask the person in between,
// each its own way; the rules and their lines are here.
//
// Needs from the host: the name of its own reader of Shamir shares, which a share typed here is
// sent to ("Restore a seed phrase from Shamir shares" in the command line's menu, "the Shares tab"
// on a page).
// Does not: ask anything, read files or QR codes, check the dates or the wallet, or search. Its
// messages name places, counts, modes and forms, never a code.
//
// Host-neutral: it reaches record.ts, the encoded backup and the share forms (sskr/transport.ts),
// for the share it refuses.

import { parseRecord, type MnemoCodeRecord } from "../record.js";
import { MarkedReading } from "../sskr/repair.js";
import { Share } from "../sskr/transport.js";
import { ShareInput } from "../sskr/share-input.js";
import { EncodedBackup, FIT_NO_FORM, type EncodedFormat } from "./encoded-backup.js";
import { EncodedForm } from "./encoded-form.js";
import { withJoinedMarksHint } from "./code-text.js";
import { assertWordCount, type Bip39WordCount } from "./bip39-sizes.js";
import { ENCODED_FORMATS } from "./types.js";
import { Masking } from "./masking.js";
import { MissingCodes } from "./missing-codes.js";
import { detectInputFormats } from "./representations.js";
import { Redacted } from "./redacted.js";
import { CRC32_BYTES } from "../sskr/checksum.js";
import { BITS_PER_BYTE } from "./bits.js";
import type { MaskingMode } from "./types.js";
import { defined } from "./defined.js";
import { ErrorCatalog, suppliedMessage } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.backup-reading", {
  "date-recovery-available-only-records-created-seedshift": () =>
    "Date recovery is available only for records created with Seedshift.",
  "shamir-share-not-encoded-seed-phrase-reads": (value0: string) =>
    `This is a Shamir share, not an encoded seed phrase: ${value0} reads it.`,
  "formats-refused": suppliedMessage,
});

/** What a host reads a backup for. */
export interface ReadingRules {
  /**
   * Only a Seedshift backup will do, as for a search of forgotten date digits: a record without
   * Seedshift is refused.
   */
  readonly seedshiftOnly: boolean;
  /** Where the host reads Shamir shares, for the refusal of a share typed here. */
  readonly shareReader: string;
  /**
   * The words of the seed phrase, where the person gave them: only the codes of so many words
   * from the start are read, as printed cards end with decoys (EncodedForm.leadingCodes).
   */
  readonly words?: Bip39WordCount | undefined;
}

/**
 * What a text given in place of an encoded seed phrase is, as shareKind tells it: a Shamir share,
 * or either a share or the codes, which only the person can tell.
 */
export type ShareKind = "share" | "either";

/**
 * Unknown bits of a marked share below which its solution settles that the text is a share: its
 * CRC-32 alone is 32 bits, and its version, length and layout add some 20 more.
 */
const SURE_SHARE_UNKNOWN_BITS = CRC32_BYTES * BITS_PER_BYTE;

/**
 * One backup as given, before its codes are read: the text and its record header. A class, so
 * that the header is read once, the refusals that need nothing but the text come first, and every
 * later rule works on the same reading; it keeps the text, which may be the seed phrase itself, out
 * of toString, toJSON and Node.js's inspect.
 */
export class BackupReading extends Redacted {
  readonly #record: MnemoCodeRecord | undefined;
  readonly #payload: string;
  readonly #words: Bip39WordCount | undefined;

  private constructor(
    record: MnemoCodeRecord | undefined,
    payload: string,
    words: Bip39WordCount | undefined,
  ) {
    super("BackupReading");
    this.#record = record;
    this.#payload = payload;
    this.#words = words;
  }

  /**
   * Reads the record header of `text`, if it has one, and refuses at once what no answer to a
   * later question can mend: a header that cannot be read, a record without Seedshift where only
   * Seedshift will do, and a Shamir share where an encoded seed phrase was asked for.
   */
  static of(text: string, rules: ReadingRules): BackupReading {
    if (rules.words !== undefined) assertWordCount(rules.words);
    const record = parseRecord(text);
    if (record !== undefined && !Masking.isMaskedMode(record.mode) && rules.seedshiftOnly)
      throw ERRORS.create("date-recovery-available-only-records-created-seedshift", []);
    const payload = record?.payload ?? text;
    // A share's own checksum makes a phrase's codes read as one only by a chance of about one in
    // four billion (transport.ts); a record header says it is no share.
    if (record === undefined && Share.reads(payload))
      throw ERRORS.create("shamir-share-not-encoded-seed-phrase-reads", [`${rules.shareReader}`]);
    return new BackupReading(record, payload, rules.words);
  }

  /**
   * The text of the codes in `format`: with the words of the phrase given, only the codes of so
   * many words from the start (EncodedForm.leadingCodes); all of them otherwise.
   */
  #payloadIn(format: EncodedFormat): string {
    if (this.#words === undefined) return this.#payload;
    return EncodedForm.of(format).leadingCodes(this.#payload, this.#words);
  }

  /** The text in the record's form, or the form its characters most likely are (#payloadIn). */
  get #likelyPayload(): string {
    return this.#payloadIn(this.#record?.format ?? EncodedForm.likely(this.#payload));
  }

  /**
   * The forms that `detect` finds the codes to fit, each tried on its own leading codes where the
   * words of the phrase were given (#payloadIn).
   */
  #fitting(detect: (payload: string) => EncodedFormat[]): EncodedFormat[] {
    if (this.#words === undefined) return detect(this.#payload);
    return ENCODED_FORMATS.filter((format) => detect(this.#payloadIn(format)).includes(format));
  }

  /**
   * Whether `text`, given in place of an encoded seed phrase, holds Shamir shares: "share" when it
   * reads as one and not as codes, "either" when it reads as both, which only the person can
   * tell; undefined when it is no share, or carries a record header, which only codes have. A
   * complete share's own checksum makes codes read as one only by a chance of about one in four
   * billion. Marked with ?, it is a share when one of its readings as a share has a solution
   * (sskr/repair.ts); word numbers and Unicode codes of 21 or 24 may then also be the codes of a
   * phrase with the same marks: with few marks the share's checksum settles it, with many they
   * are "either". A file or paste is split by ShareInput before testing each part, so later shares
   * are not mistaken for the decoy codes after the first one. Unreadable parts stay for the share
   * reader to name; any definite share sends the whole text to it.
   */
  static shareKind(text: string): ShareKind | undefined {
    if (parseRecord(text) !== undefined) return undefined;
    const parts = ShareInput.partsOfText(text);
    if (parts.length > 1) {
      let possible: ShareKind | undefined;
      for (const part of parts) {
        const kind = BackupReading.shareKind(part);
        if (kind === "share") return kind;
        possible ??= kind;
      }
      return possible;
    }
    const part = parts[0] ?? text;
    if (Share.reads(part)) return "share";
    if (!MissingCodes.marked(part)) return undefined;
    // The unknown bits of each reading that has a solution; the spaces themselves are wiped.
    let unknownBits: number[] = [];
    try {
      unknownBits = MarkedReading.of(part.trim()).flatMap((reading) =>
        reading.withSpace((space) => (space === undefined ? [] : [space.unknownBits])),
      );
    } catch {
      return undefined;
    }
    if (unknownBits.length === 0) return undefined;
    // A share's checksum and layout are more than 50 bits of rules: marks of up to 32 unknown bits
    // that still meet them leave no doubt, while text of another kind meets them by chance only.
    if (unknownBits.some((bits) => bits <= SURE_SHARE_UNKNOWN_BITS)) return "share";
    return MissingCodes.formats(part).length > 0 ? "either" : "share";
  }

  /** Whether the text has an MNC1 record header, which names the mode and the form. */
  get hasRecord(): boolean {
    return this.#record !== undefined;
  }

  /**
   * The mode of the codes: the record's, or `given` by the host; undefined when neither names it,
   * and the host asks the person. Where the record and `given` differ, it is the record's, which
   * the host offers after modeConflict.
   */
  mode(given?: MaskingMode): MaskingMode | undefined {
    return this.#record?.mode ?? given;
  }

  /** The line that says that the record names another mode than `given`, or undefined. */
  modeConflict(given?: MaskingMode): string | undefined {
    return modeConflictOf(this.#record?.mode, given);
  }

  /** The line that says that the record holds codes of another form than `given`, or undefined. */
  formatConflict(given?: EncodedFormat): string | undefined {
    return formatConflictOf(this.#record?.format, given);
  }

  /**
   * The forms that the codes may be in: the record's, or `given`, or every form that they fit,
   * of which the host asks for one when there are several. Throws why the codes fit no form, as
   * the form that their characters most likely are names it.
   */
  formats(given?: EncodedFormat): EncodedFormat[] {
    return this.#formatsOf(given, detectInputFormats, () =>
      EncodedBackup.whyUnreadable(this.#likelyPayload),
    );
  }

  /**
   * The named form (#namedFormat), or every form that `detect` finds the codes to fit; throws
   * `none()` when they fit none. Complete and marked codes differ only in these two.
   */
  #formatsOf(
    given: EncodedFormat | undefined,
    detect: (payload: string) => EncodedFormat[],
    none: () => string,
  ): EncodedFormat[] {
    const named = this.#namedFormat(given);
    if (named !== undefined) return [named];
    const fitting = this.#fitting(detect);
    if (fitting.length === 0) throw ERRORS.create("formats-refused", [none()]);
    return fitting;
  }

  /**
   * The form that is named, before any is detected: the record's, which wins over `given`, the
   * host's; undefined when neither names one. Complete and marked codes take it alike
   * (AUD-012-ARC006).
   */
  #namedFormat(given: EncodedFormat | undefined): EncodedFormat | undefined {
    return this.#record?.format ?? given;
  }

  /**
   * Whether `text`, given where the words of a seed phrase were asked for, is the codes of an
   * encoded seed phrase in a form other than words: complete, or marked with ? (MissingCodes). A
   * host that reads words then says where codes are read instead.
   */
  static isCodes(text: string): boolean {
    const forms = MissingCodes.marked(text) ? MissingCodes.formats(text) : detectInputFormats(text);
    return forms.some((format) => format !== "english");
  }

  /** Whether the codes mark some that cannot be read (MissingCodes.marked), to be searched. */
  get marked(): boolean {
    if (this.#record === undefined && this.#words !== undefined) {
      // Hexadecimal Color Unicode also looks like word Unicode: a fitting form, rather than
      // that guess, decides which codes precede the decoys when no record names the form.
      const fitting = this.#fitting((payload) => MissingCodes.formats(payload));
      if (fitting.length > 0)
        return fitting.some((format) => MissingCodes.marked(this.#payloadIn(format)));
    }
    return MissingCodes.marked(this.#likelyPayload);
  }

  /**
   * The forms that the marked codes may be in: the record's, or `given`, or every form that they
   * fit (MissingCodes.formats). Throws when they fit none.
   */
  markedFormats(given?: EncodedFormat): EncodedFormat[] {
    return this.#formatsOf(
      given,
      (payload) => MissingCodes.formats(payload),
      () =>
        withJoinedMarksHint(
          `${FIT_NO_FORM}: mark each code that cannot be read with ?, in its place.`,
          this.#payload,
        ),
    );
  }

  /** The marked codes in `format`, taken as not masked until the host gives their mode. */
  missingCodes(format: EncodedFormat): MissingCodes {
    return MissingCodes.read(this.#payloadIn(format), format, "direct");
  }

  /**
   * The codes in `format`, held to the rules that need no mode: their count, and that each is a
   * code of that form (EncodedBackup.read). The host then gives them their mode (withMode), which
   * may find the checksum missing (MissingChecksumError).
   */
  codes(format: EncodedFormat): EncodedBackup {
    return EncodedBackup.read(this.#payloadIn(format), format, "direct");
  }
}

/**
 * Whether a host gave a record's metadata, mode or form, as another value than the record names:
 * never where either is missing. The one rule of both conflicts below.
 */
function metadataDiffers<T>(recorded: T | undefined, given: T | undefined): boolean {
  return recorded !== undefined && given !== undefined && given !== recorded;
}

/**
 * The line that says that a record made with `recorded` was given another mode, `given`, or
 * undefined when either is missing or they agree. A host answers it in its way: the command line
 * refuses, a question offers the record's mode.
 */
export function modeConflictOf(
  recorded: MaskingMode | undefined,
  given: MaskingMode | undefined,
): string | undefined {
  if (!metadataDiffers(recorded, given)) return undefined;
  return `The record was made with ${Masking.of(defined(recorded)).name}, not with ${Masking.of(defined(given)).name}.`;
}

/** The same for the form of the codes: the record's, `recorded`, and `given`. */
export function formatConflictOf(
  recorded: EncodedFormat | undefined,
  given: EncodedFormat | undefined,
): string | undefined {
  if (!metadataDiffers(recorded, given)) return undefined;
  return `The record holds ${recorded} codes, not ${given}.`;
}
