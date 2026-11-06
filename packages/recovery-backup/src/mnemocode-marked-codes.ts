import {
  mnemoCodeCodesText,
  readMnemoCodeBackup,
  type MnemoCodeFormat,
  type MnemoCodeMode,
  type MnemoCodePhraseWords,
} from "./mnemocode.js";
import { mnemocode } from "./mnemocode-engine.js";
import { isMaskingMode, type EncodedFormat, type MaskingMode } from "./mnemocode-facts.js";
import type { MissingCodesWay } from "./mnemocode-search.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { defined } from "@ckd/core/defined.js";
import { MnemoCodeInputAdmission } from "./mnemocode-input.js";
const ERRORS = new ErrorCatalog("wallet.mnemocode-marked-codes", {
  ambiguous: () =>
    "These marked codes fit several representations: choose theirs in Representation, then press the button again.",
});
/** A way to tell the right codes, with MnemoCode's label and note. */
export interface MissingCodesWayChoice {
  readonly way: MissingCodesWay;
  readonly label: string;
  readonly note: string;
}

interface MarkedFacts {
  readonly format: EncodedFormat;
  readonly mode: MaskingMode;
  readonly words: MnemoCodePhraseWords;
  readonly needsDates: boolean;
  readonly many: boolean;
  readonly unreadable: string;
  readonly ways: readonly MissingCodesWayChoice[];
}

/** Admitted marked text in mutable ownership; only public search metadata survives disposal. */
export class MnemoCodeMarkedCodes implements Disposable {
  readonly #text: SecretValue<string>;
  readonly #facts: MarkedFacts;
  private constructor(text: SecretValue<string>, facts: MarkedFacts) {
    this.#text = text;
    this.#facts = facts;
  }

  /** Returns no offer for unmarked text; ambiguous formats refuse before an owner is retained. */
  static read(
    text: string,
    format: MnemoCodeFormat | "auto",
    mode: MnemoCodeMode,
    words?: MnemoCodePhraseWords,
  ): MnemoCodeMarkedCodes | undefined {
    MnemoCodeInputAdmission.assertSize(text, "MnemoCode input");
    using source = SecretValue.text(text);
    using reading = readMnemoCodeBackup(source.value, false, words);
    if (!reading.marked) return undefined;
    const formats = reading.markedForms(format === "auto" ? undefined : format);
    if (formats.length > 1) throw ERRORS.create("ambiguous", []);
    const read = reading.mode(mode);
    const admittedMode = isMaskingMode(read) ? read : mode;
    const admittedFormat = defined(formats[0]) as EncodedFormat;
    // Only what MnemoCode says of the codes is kept here; the worker makes the search itself.
    using marked = mnemocode().MarkedCodes.read(
      mnemoCodeCodesText(source.value),
      admittedFormat,
      admittedMode,
    );
    const ways = Array.from({ length: marked.ways }, (_, at) => {
      using way = defined(marked.way(at));
      return Object.freeze({
        way: way.way as MissingCodesWay,
        label: way.label,
        note: way.note,
      });
    });
    const facts: MarkedFacts = {
      format: admittedFormat,
      mode: admittedMode,
      words,
      needsDates: marked.needsDates,
      many: marked.many !== undefined,
      unreadable: marked.unreadable,
      ways: Object.freeze(ways),
    };
    return new MnemoCodeMarkedCodes(source.copy(), facts);
  }
  /** Temporary decoded view; refuses with core.secret-value.wiped after disposal. */
  get text(): string {
    return this.#text.value;
  }
  /** Representation admitted by the library, including a record's own declaration. */
  get format(): EncodedFormat {
    return this.#facts.format;
  }
  /** Masking mode admitted by the library. */
  get mode(): MaskingMode {
    return this.#facts.mode;
  }
  /** Declared phrase size, so printed decoys do not extend the backup. */
  get words(): MnemoCodePhraseWords {
    return this.#facts.words;
  }
  /** Public search metadata; contains neither codes nor a phrase. */
  get needsDates(): boolean {
    return this.#facts.needsDates;
  }
  /** Whether the library recommends identifying evidence rather than listing all candidates. */
  get many(): boolean {
    return this.#facts.many;
  }
  /** Public description of missing positions and search size. */
  get unreadable(): string {
    return this.#facts.unreadable;
  }
  /** The library's admitted ways, labels and notes; never a second frontend policy. */
  get ways(): readonly MissingCodesWayChoice[] {
    return this.#facts.ways;
  }
  /** Maps a native choice only to a way this admitted input actually offers. */
  way(value: unknown): MissingCodesWay | undefined {
    return this.#facts.ways.find(({ way }) => way === value)?.way;
  }
  /** Releases retained typed text; returned string views cannot be recalled. */
  wipe(): void {
    this.#text.wipe();
  }
  /** Ends the offered input's lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
