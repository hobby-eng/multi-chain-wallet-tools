// Seedshift masking and its variants: the one place that tells the four transformation modes apart.
// Each mode is one Masking value with everything that differs between them: its name, whether it
// masks with dates, whether its codes keep the BIP39 checksum, whether complete dates still leave
// several phrases, what a backup made with it allows, how it writes a seed phrase and undoes its
// codes, and the wallet checks that one date combination of a search costs. Every other module asks
// the Masking of a mode instead of switching over the mode names, so that a new variant is one more
// value here and nothing else.
//
// Needs from the host: nothing.
// Does not: read or write codes in their forms (core/encoded-backup.ts), search dates
// (core/date-search.ts) or check a wallet. Its messages never repeat a word or a code.
//
// Host-neutral: it reaches only @scure/bip39 and its word lists, through the core modules.

import {
  decodeIndexesDirect,
  decodeIndexesLegacy,
  undoLegacyValid,
  undoSeedshift,
  encodeMnemonic,
  encodeMnemonicLegacy,
  legacyChecksumValidResult,
  representMnemonic,
} from "./seedshift.js";
import {
  MASKING_MODES,
  type DateShiftDate,
  type DecodedResult,
  type EncodedResult,
  type MaskingMode,
  type EncodedFormat,
  isMaskingMode,
} from "./types.js";
import {
  BIP39_DICTIONARY_SIZE,
  checksumPassShare,
  lastWordEntropyValues,
  assertPhraseIndexes,
} from "./bip39-sizes.js";
import { assertWordCount } from "./words.js";
import { phraseChecksumValid, phraseOfIndexes } from "./english-words.js";
import { parseInput } from "./representations.js";

/**
 * How a seed phrase was written: not masked, or one of the Seedshift variants. The names are
 * neutral metadata (core/types.ts), which a record reads without the rules below.
 */
export type { MaskingMode };

/** What a backup made with a mode allows besides the backup itself. */
export interface MaskingCapabilities {
  /** Whether the seed phrase can be split into Shamir shares in this mode. */
  readonly split: boolean;
  /** Whether what was written down can be checked against the result (core/backup-check.ts). */
  readonly backupCheck: boolean;
  /** Whether a sheet for heirs can be made: it leads through the restore of the host. */
  readonly heirSheet: boolean;
}

/** What one variant is, as the class below hands it out. */
interface Variant {
  readonly name: string;
  readonly masked: boolean;
  readonly keepsChecksum: boolean;
  readonly givesSeveral: boolean;
  readonly capabilities: MaskingCapabilities;
  readonly encode: (mnemonic: string, dates: readonly DateShiftDate[]) => EncodedResult;
  readonly undo: (indexes: readonly number[], dates: readonly DateShiftDate[]) => DecodedResult[];
  /** The checksum-valid phrases, so wallet checks, that one date combination gives on average. */
  readonly checks: (wordCount: number) => number;
  /** What the shift of the last word is taken modulo, for a phrase of `wordCount` words. */
  readonly lastShift: (wordCount: number) => number;
  /**
   * The mode whose record a backup names when its last word is replaced by one with a valid
   * checksum; only a mode whose result usually fails the checksum offers it.
   */
  readonly withValidLastWord?: MaskingMode;
}

const VARIANTS = Object.freeze({
  direct: {
    name: "no Seedshift",
    masked: false as const,
    keepsChecksum: false,
    givesSeveral: false,
    capabilities: Object.freeze({ split: true, backupCheck: true, heirSheet: true } as const),
    encode: (mnemonic) => representMnemonic(mnemonic),
    undo: (indexes) => [decodeIndexesDirect(indexes)],
    // Without dates there is nothing to search.
    checks: () => 0,
    lastShift: () => BIP39_DICTIONARY_SIZE,
  },
  // Writes the checksum again after the shift, so that every date gives a valid phrase.
  seedshift: {
    name: "MnemoCode Seedshift",
    masked: true as const,
    keepsChecksum: true,
    givesSeveral: false,
    capabilities: Object.freeze({ split: true, backupCheck: true, heirSheet: true } as const),
    encode: encodeMnemonic,
    undo: (indexes, dates) => [undoSeedshift(indexes, dates)],
    checks: () => 1,
    // The last word holds 11 - checksum bits of entropy, and the shift is added to them alone.
    lastShift: lastWordEntropyValues,
  },
  "seedshift-legacy": {
    name: "the Original Seedshift",
    masked: true as const,
    keepsChecksum: false,
    givesSeveral: false,
    // SSKR splits the entropy of a valid BIP39 phrase, and the Original Seedshift's result usually
    // fails the checksum.
    capabilities: Object.freeze({ split: false, backupCheck: true, heirSheet: true } as const),
    encode: encodeMnemonicLegacy,
    undo: (indexes, dates) => [decodeIndexesLegacy(indexes, dates)],
    withValidLastWord: "seedshift-legacy-valid",
    // A wrong date gives a valid phrase only by chance, once in 2^bits.
    checks: checksumPassShare,
    lastShift: () => BIP39_DICTIONARY_SIZE,
  },
  // The last word replaced by one whose checksum fits: every phrase that it may have hidden is
  // tried, 2^(11 - bits) of them, and only a search finds the seed phrase again, so that no check
  // of what was written down and no sheet for heirs can undo it.
  "seedshift-legacy-valid": {
    name: "the Original Seedshift with a valid last word",
    masked: true as const,
    keepsChecksum: true,
    givesSeveral: true,
    capabilities: Object.freeze({ split: false, backupCheck: false, heirSheet: false } as const),
    encode: (mnemonic, dates) => legacyChecksumValidResult(encodeMnemonicLegacy(mnemonic, dates)),
    undo: undoLegacyValid,
    checks: lastWordEntropyValues,
    // Every last word with a valid checksum is tried, whatever the shift of the last word was.
    lastShift: () => 1,
  },
}) satisfies Readonly<Record<MaskingMode, Variant>>;

/** A variant as the rules read it, whatever literal types the table keeps. */
function variantOf(mode: MaskingMode): Variant {
  return VARIANTS[mode];
}

/** The modes whose variant has capability `K`, derived from the variants above. */
type ModesWith<K extends keyof MaskingCapabilities> = {
  [M in MaskingMode]: (typeof VARIANTS)[M]["capabilities"][K] extends true ? M : never;
}[MaskingMode];

/** The modes that mask with dates, which are then needed to undo them. */
export type MaskedMode = {
  [M in MaskingMode]: (typeof VARIANTS)[M]["masked"] extends true ? M : never;
}[MaskingMode];

/** The modes in which a seed phrase can be split into Shamir shares. */
export type SplitMode = ModesWith<"split">;
/** The modes for which a sheet for heirs can be made. */
export type HeirSheetMode = ModesWith<"heirSheet">;

/** The refusal of a value that names no mode, or no mode with dates where one is needed. */
const UNSUPPORTED_MODE = "Unsupported Seedshift mode.";

/** Why a mode is refused for shares: SSKR splits the entropy of a valid BIP39 phrase. */
export const SPLIT_MODES_ONLY = "Shares are made without Seedshift or with MnemoCode Seedshift.";

/**
 * The label of the fingerprint of codes; PHRASE_WORDS.encodedFingerprint says what a masked one
 * is.
 */
const ENCODED_FINGERPRINT = "Encoded fingerprint";

/** What the original seed phrase is, in every name of it below. */
const SEED_PHRASE_OF_THE_WALLET = "seed phrase, the wallet's";

/**
 * The words that every result uses for the two phrases, so that the command line and a page say
 * the same and no one takes the masked phrase for the wallet's: the original seed phrase is the
 * wallet's; Seedshift turns it into the masked phrase, a valid decoy that codes and shares of a
 * masked backup hold, and the dates turn it back. Hosts show these texts as they are.
 */
export const PHRASE_WORDS = Object.freeze({
  original: `the original ${SEED_PHRASE_OF_THE_WALLET}`,
  /** The label above each phrase that a restore from shares found, before its notes. */
  originalLabel: `Original ${SEED_PHRASE_OF_THE_WALLET}`,
  originalItself: "the original seed phrase itself",
  masked: "the masked phrase (decoy)",
  originalFingerprint: "Original fingerprint",
  encodedFingerprint: `${ENCODED_FINGERPRINT} (of the masked phrase)`,
  /** Under both fingerprints of a masked backup. */
  fingerprintRoles: "Original is the wallet itself; encoded is the masked phrase (decoy).",
  /** Above shares that a repair with the dates gives back. */
  repairedMasked:
    "The repaired shares are the shares as written: they hold the masked phrase (decoy). The dates only checked them against the wallet; a restore with the same dates gives the original seed phrase.",
  /** Above shares that a repair without the mode gives back. */
  repairedUnknown:
    "The repaired shares are the shares as written: they hold the phrase they were split from, the masked phrase (decoy) if Seedshift was used.",
});

/** How a refusal of a wrong number of dates is worded (Masking.assertDateCount). */
export interface DateCountWords {
  /** Dates given for direct mode, which takes none. */
  readonly direct: string;
  /** No date given for `mode`, which masks with them. */
  readonly missing: (mode: MaskingMode) => string;
}

/** Shares refuse dates in direct mode in these words, whether they are made or restored. */
const SHARES_TAKE_NO_DATES = "Direct mode does not accept dates.";

/**
 * The refusals of a wrong number of dates, one rule in the words each command has always used:
 * codes (encode, decode and every host, the default), a split into shares, and a restore or
 * export from shares. Shares are masked only with MnemoCode Seedshift (SPLIT_MODES_ONLY), which
 * their words name.
 */
export const DATE_COUNT_WORDS = Object.freeze({
  codes: Object.freeze({
    direct: "Dates cannot be used in direct mode.",
    missing: (mode: MaskingMode) => `${mode} requires at least one date.`,
  }),
  split: Object.freeze({
    direct: SHARES_TAKE_NO_DATES,
    missing: () => "Seedshift requires at least one date.",
  }),
  recovery: Object.freeze({
    direct: SHARES_TAKE_NO_DATES,
    missing: () => "Seedshift recovery requires its original dates.",
  }),
} satisfies Readonly<Record<string, DateCountWords>>);

/** The modes, in the order the menu and the help name them. */
const MODES: readonly MaskingMode[] = MASKING_MODES;

/**
 * One transformation mode. A class, so that every rule that tells the modes apart is the
 * operation of one value, chosen once with `of`, and no caller switches over the mode names; the
 * values are fixed and shared.
 */
export class Masking {
  readonly #mode: MaskingMode;
  readonly #variant: Variant;

  private constructor(mode: MaskingMode) {
    this.#mode = mode;
    this.#variant = VARIANTS[mode];
  }

  /** Every mode, in the order the menu and the help name them. */
  static readonly MODES: readonly MaskingMode[] = MODES;

  /** The one value of each mode. */
  static readonly #values: Readonly<Record<MaskingMode, Masking>> = Object.freeze(
    Object.fromEntries(MODES.map((mode) => [mode, new Masking(mode)])) as Record<
      MaskingMode,
      Masking
    >,
  );

  /** Whether `value` names a mode; a JavaScript host or a parsed file may pass anything. */
  static isMode(value: unknown): value is MaskingMode {
    return isMaskingMode(value);
  }

  /** The masking of `mode`; refuses a value that names none. */
  static of(mode: MaskingMode): Masking {
    if (!Masking.isMode(mode)) throw new Error(UNSUPPORTED_MODE);
    return Masking.#values[mode];
  }

  get mode(): MaskingMode {
    return this.#mode;
  }

  /** The mode by the name that the menu and the help use in a sentence: "MnemoCode Seedshift". */
  get name(): string {
    return this.#variant.name;
  }

  /** Whether the mode masks with dates, which are then needed to undo it. */
  get masked(): boolean {
    return this.#variant.masked;
  }

  /**
   * Refuses `count` dates where the mode takes none, and none where it needs them, unless they are
   * asked later (`askedLater`), on the private screen, in the command's `words`. Every command
   * checks the dates it was given with it before it reads a secret; the shifts refuse a masking
   * without dates again (deriveShifts).
   */
  assertDateCount(
    count: number,
    askedLater = false,
    words: DateCountWords = DATE_COUNT_WORDS.codes,
  ): void {
    this.#assertTakesDates(count, words);
    if (this.masked && count === 0 && !askedLater) throw new Error(words.missing(this.#mode));
  }

  /**
   * Refuses `count` dates where the mode takes none: the half of assertDateCount that encode and
   * undo hold every caller to, so that dates given without Seedshift are refused, never dropped
   * (AUD-014-API005). A masked mode without dates is refused by its shifts (deriveShifts).
   */
  #assertTakesDates(count: number, words: DateCountWords = DATE_COUNT_WORDS.codes): void {
    if (!this.masked && count > 0) throw new Error(words.direct);
  }

  /**
   * What the codes or the shares of this mode hold, as a result says it, so that no one takes the
   * masked phrase for the wallet's (PHRASE_WORDS).
   */
  get holds(): string {
    return this.#variant.masked ? PHRASE_WORDS.masked : PHRASE_WORDS.originalItself;
  }

  /** The label of the fingerprint of the codes: that of the masked phrase where the mode masks. */
  get encodedFingerprintLabel(): string {
    return this.#variant.masked ? PHRASE_WORDS.encodedFingerprint : ENCODED_FINGERPRINT;
  }

  /**
   * Whether the codes are a valid BIP39 phrase themselves. Such a mode gives a valid phrase for
   * every date too, so that only the wallet tells the right dates.
   */
  get keepsChecksum(): boolean {
    return this.#variant.keepsChecksum;
  }

  /** Wrong-date guidance follows this mode's checksum rule, never a front end's mode switch. */
  get wrongDateWarning(): string | undefined {
    if (!this.masked) return undefined;
    const result = this.keepsChecksum
      ? "Wrong dates can still give a valid seed phrase."
      : "Wrong dates may fail the checksum or give a valid seed phrase.";
    return `${result} A valid checksum does not confirm the owner's wallet.`;
  }

  /**
   * The mode that a backup of this mode names once its last word is replaced by one with a valid
   * checksum, or undefined where the mode offers no replacement.
   */
  get withValidLastWord(): Masking | undefined {
    const mode = this.#variant.withValidLastWord;
    return mode === undefined ? undefined : Masking.of(mode);
  }

  /**
   * Whether a seed phrase can be encoded in this mode directly; a mode that only a replaced last
   * word gives (withValidLastWord) cannot.
   */
  get encodable(): boolean {
    return !MODES.some((mode) => variantOf(mode).withValidLastWord === this.#mode);
  }

  /**
   * Whether complete dates still leave several phrases: the Original Seedshift's valid last word.
   */
  get givesSeveral(): boolean {
    return this.#variant.givesSeveral;
  }

  get capabilities(): MaskingCapabilities {
    return this.#variant.capabilities;
  }

  /** Whether `mode` names a mode that masks with dates. */
  static isMaskedMode(mode: unknown): mode is MaskedMode {
    return Masking.isMode(mode) && VARIANTS[mode].masked;
  }

  /**
   * Refuses a value that names no mode with dates: a JavaScript host may pass any value, and
   * another mode would silently decode another way. The guard of every date search.
   */
  static assertMaskedMode(mode: unknown): asserts mode is MaskedMode {
    if (!Masking.isMaskedMode(mode)) throw new Error(UNSUPPORTED_MODE);
  }

  /** Whether `mode` names a mode in which a seed phrase can be split into shares. */
  static isSplitMode(mode: unknown): mode is SplitMode {
    return Masking.isMode(mode) && VARIANTS[mode].capabilities.split;
  }

  /** Refuses a mode in which no shares are made (SPLIT_MODES_ONLY). */
  static assertSplitMode(mode: unknown): asserts mode is SplitMode {
    if (!Masking.isSplitMode(mode)) throw new Error(SPLIT_MODES_ONLY);
  }

  /** Whether `mode` names a mode for which a sheet for heirs can be made. */
  static isHeirSheetMode(mode: unknown): mode is HeirSheetMode {
    return Masking.isMode(mode) && VARIANTS[mode].capabilities.heirSheet;
  }

  /** Refuses a mode for which no sheet for heirs can be made: only a search finds its phrase. */
  static assertHeirSheetMode(mode: unknown): asserts mode is HeirSheetMode {
    if (!Masking.isHeirSheetMode(mode))
      throw new Error(
        `A sheet for heirs cannot be made for ${Masking.isMode(mode) ? Masking.of(mode).name : "this mode"}: only a search finds its seed phrase.`,
      );
  }

  /** The codes of `mnemonic` masked with `dates` in this mode; no dates without Seedshift. */
  encode(mnemonic: string, dates: readonly DateShiftDate[]): EncodedResult {
    this.#assertTakesDates(dates.length);
    return this.#variant.encode(mnemonic, dates);
  }

  /**
   * The phrase that a backup made of `mnemonic` in this mode holds, in its shares or its codes:
   * the seed phrase itself, or the phrase that Seedshift masks it as with `dates`.
   */
  held(mnemonic: string, dates: readonly DateShiftDate[]): string {
    return this.encode(mnemonic, dates).shiftedEnglish.join(" ");
  }

  /**
   * Every phrase that `indexes`, BIP39 indexes from 0 to 2047, and the complete `dates` give: one,
   * unless givesSeveral. Throws when the codes cannot be undone in this mode, and for dates
   * without Seedshift.
   */
  undo(indexes: readonly number[], dates: readonly DateShiftDate[]): DecodedResult[] {
    this.#assertTakesDates(dates.length);
    this.assertCodes(indexes);
    return this.#variant.undo(indexes, dates);
  }

  /**
   * Refuses codes that this mode cannot have written: a phrase's count and BIP39 indexes, and,
   * where the mode keeps the checksum (keepsChecksum), a valid one (MissingChecksum).
   */
  assertCodes(indexes: readonly number[]): void {
    // Checked before the words are looked up, which would report a bad index as a bad checksum.
    assertPhraseIndexes(indexes);
    if (this.keepsChecksum && !phraseChecksumValid(phraseOfIndexes(indexes)))
      throw new MissingChecksum(this.#mode);
  }

  /**
   * The checksum-valid phrases, so the wallet checks, that one date combination of a search gives
   * on average for a phrase of `wordCount` words, from the checksum bits of the phrase.
   */
  checksPerCombination(wordCount: number): number {
    assertWordCount(wordCount);
    return this.#variant.checks(wordCount);
  }

  /**
   * The wallet checks that decoding one set of codes with complete dates gives on average, for a
   * phrase of `wordCount` words: its one phrase without Seedshift, and with it as many as one
   * date combination gives (checksPerCombination), 128 for a 12-word phrase whose last word was
   * replaced.
   */
  checksPerDecoding(wordCount: number): number {
    return this.masked ? this.checksPerCombination(wordCount) : 1;
  }

  /**
   * The shifts of one date combination as this mode applies them: each word number moves modulo
   * the 2,048 words, and the last word modulo what this mode adds its shift to (lastShift), so
   * that two combinations with the same effective shifts give the same phrases.
   */
  effectiveShifts(shifts: readonly number[]): number[] {
    const last = this.lastShiftModulus(shifts.length);
    return shifts.map((shift, index) =>
      index === shifts.length - 1 ? shift % last : shift % BIP39_DICTIONARY_SIZE,
    );
  }

  /** What the shift of the last word of a `wordCount`-word phrase is taken modulo in this mode. */
  lastShiftModulus(wordCount: number): number {
    assertWordCount(wordCount);
    return this.#variant.lastShift(wordCount);
  }

  toString(): string {
    return this.#mode;
  }
}

/** Codes that lack the BIP39 checksum that their mode gives every phrase it writes. */
export class MissingChecksum extends Error {
  readonly mode: MaskingMode;

  constructor(mode: MaskingMode) {
    super(`These codes lack the BIP39 checksum that ${Masking.of(mode).name} gives them.`);
    this.name = "MissingChecksum";
    this.mode = mode;
  }
}

// The low-level decoders of the public API, each through Masking so that each holds its rules.

/** MnemoCode Seedshift undone: the seed phrase of `indexes` with `dates`. */
export function decodeIndexes(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult {
  return Masking.of("seedshift").undo(indexes, dates)[0]!;
}

/** The Original Seedshift with a valid last word undone: every phrase it may have been. */
export function decodeIndexesLegacyValid(
  indexes: readonly number[],
  dates: readonly DateShiftDate[],
): DecodedResult[] {
  return Masking.of("seedshift-legacy-valid").undo(indexes, dates);
}

/**
 * MnemoCode Seedshift undone from codes written in `format`. A compatibility entry kept for
 * existing callers; new code reads codes of any mode with EncodedBackup.read(text, format, mode).
 */
export function decodeInput(
  value: string,
  format: EncodedFormat,
  dates: readonly DateShiftDate[],
): DecodedResult {
  return decodeIndexes(parseInput(value, format), dates);
}
