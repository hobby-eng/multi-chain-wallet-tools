// What the pages need to know of MnemoCode's modes and forms before they call it: their names in
// MnemoCode's order, which modes mask with dates and what a backup of each allows, how each form
// is written, and the words every result uses for the two phrases. MnemoCode's WebAssembly does
// the work and refuses what it does not take; it exports no such table, so this one follows
// MnemoCode's own (crates/mnemocode/src/modes.rs and forms.rs, docs/LIBRARY.md).
import manifest from "@ckd/mnemocode-wasm/modules.json";

/** The version of MnemoCode's WebAssembly in this page. */
export const MNEMOCODE_VERSION: string = manifest.version;

/** The modes by the names that records and MnemoCode use, in its order. */
export const MASKING_MODES = Object.freeze([
  "direct",
  "seedshift",
  "seedshift-legacy",
  "seedshift-legacy-valid",
] as const);
export type MaskingMode = (typeof MASKING_MODES)[number];

/** The forms of codes, in MnemoCode's order. */
export const ENCODED_FORMATS = Object.freeze([
  "english",
  "indexes",
  "unicode",
  "colors-unicode",
  "colors",
] as const);
export type EncodedFormat = (typeof ENCODED_FORMATS)[number];

/** The forms of Shamir shares, in MnemoCode's order, with their names. */
export const SHARE_FORMAT_NAMES = Object.freeze({
  ur: "Compact UR",
  words: "Bytewords",
  indexes: "BIP39 word numbers",
  unicode: "Unicode codes",
  colors: "RGB hexadecimal codes (ordered)",
  "colors-unicode": "Colors as Unicode codes",
} as const);
export type ShareFormat = keyof typeof SHARE_FORMAT_NAMES;
export const SHARE_FORMATS = Object.freeze(Object.keys(SHARE_FORMAT_NAMES) as ShareFormat[]);

/** The form in which a restored backup is shown: the one its shares look like. */
export const RESTORED_FORM: Readonly<Record<ShareFormat, EncodedFormat>> = Object.freeze({
  ur: "english",
  words: "english",
  indexes: "indexes",
  unicode: "unicode",
  colors: "colors",
  "colors-unicode": "colors-unicode",
});

export function isMaskingMode(value: unknown): value is MaskingMode {
  return (MASKING_MODES as readonly unknown[]).includes(value);
}

export function isEncodedFormat(value: unknown): value is EncodedFormat {
  return (ENCODED_FORMATS as readonly unknown[]).includes(value);
}

export function isShareFormat(value: unknown): value is ShareFormat {
  return typeof value === "string" && Object.hasOwn(SHARE_FORMAT_NAMES, value);
}

/** What the original seed phrase is, in every name of it below. */
const SEED_PHRASE_OF_THE_WALLET = "seed phrase, the wallet's";
const ENCODED_FINGERPRINT = "Encoded fingerprint";

/**
 * The words that every result uses for the two phrases, as MnemoCode says them: the original seed
 * phrase is the wallet's; Seedshift turns it into the masked phrase, a valid decoy that codes and
 * shares of a masked backup hold, and the dates turn it back.
 */
export const PHRASE_WORDS = Object.freeze({
  original: `the original ${SEED_PHRASE_OF_THE_WALLET}`,
  originalLabel: `Original ${SEED_PHRASE_OF_THE_WALLET}`,
  originalItself: "the original seed phrase itself",
  masked: "the masked phrase (decoy)",
  originalFingerprint: "Original fingerprint",
  encodedFingerprint: `${ENCODED_FINGERPRINT} (of the masked phrase)`,
  fingerprintRoles: "Original is the wallet itself; encoded is the masked phrase (decoy).",
  repairedMasked:
    "The repaired shares are the shares as written: they hold the masked phrase (decoy). The dates only checked them against the wallet; a restore with the same dates gives the original seed phrase.",
  repairedUnknown:
    "The repaired shares are the shares as written: they hold the phrase they were split from, the masked phrase (decoy) if Seedshift was used.",
});

/** What a backup made in a mode allows besides the backup itself. */
export interface MaskingCapabilities {
  readonly split: boolean;
  readonly backupCheck: boolean;
  readonly heirSheet: boolean;
}

interface ModeFacts {
  readonly name: string;
  readonly masked: boolean;
  readonly keepsChecksum: boolean;
  readonly givesSeveral: boolean;
  readonly capabilities: MaskingCapabilities;
  readonly withValidLastWord?: MaskingMode;
}

const MODES: Readonly<Record<MaskingMode, ModeFacts>> = Object.freeze({
  direct: {
    name: "no Seedshift",
    masked: false,
    keepsChecksum: false,
    givesSeveral: false,
    capabilities: { split: true, backupCheck: true, heirSheet: true },
  },
  seedshift: {
    name: "MnemoCode Seedshift",
    masked: true,
    keepsChecksum: true,
    givesSeveral: false,
    capabilities: { split: true, backupCheck: true, heirSheet: true },
  },
  "seedshift-legacy": {
    name: "the Original Seedshift",
    masked: true,
    keepsChecksum: false,
    givesSeveral: false,
    capabilities: { split: false, backupCheck: true, heirSheet: true },
    withValidLastWord: "seedshift-legacy-valid",
  },
  "seedshift-legacy-valid": {
    name: "the Original Seedshift with a valid last word",
    masked: true,
    keepsChecksum: true,
    givesSeveral: true,
    capabilities: { split: false, backupCheck: false, heirSheet: false },
  },
});

/** One mode's facts; `of` gives the one value of each. */
export class Masking {
  readonly #mode: MaskingMode;
  readonly #facts: ModeFacts;

  private constructor(mode: MaskingMode) {
    this.#mode = mode;
    this.#facts = MODES[mode];
  }

  static readonly #values = new Map(MASKING_MODES.map((mode) => [mode, new Masking(mode)]));

  static of(mode: MaskingMode): Masking {
    const masking = Masking.#values.get(mode);
    if (masking === undefined) throw new Error("Unsupported Seedshift mode.");
    return masking;
  }

  get mode(): MaskingMode {
    return this.#mode;
  }

  /** Its name in a sentence: "MnemoCode Seedshift". */
  get name(): string {
    return this.#facts.name;
  }

  /** Whether it masks with dates, which are then needed to undo it. */
  get masked(): boolean {
    return this.#facts.masked;
  }

  /** Whether its codes are a valid BIP39 phrase themselves. */
  get keepsChecksum(): boolean {
    return this.#facts.keepsChecksum;
  }

  /** Whether complete dates still leave several phrases: the valid last word's. */
  get givesSeveral(): boolean {
    return this.#facts.givesSeveral;
  }

  get capabilities(): MaskingCapabilities {
    return this.#facts.capabilities;
  }

  /** The mode a backup names once its last word is replaced by a valid one, where it offers that. */
  get withValidLastWord(): Masking | undefined {
    const mode = this.#facts.withValidLastWord;
    return mode === undefined ? undefined : Masking.of(mode);
  }

  /** Whether a phrase can be encoded in it directly: a mode that only a replaced last word gives cannot. */
  get encodable(): boolean {
    return !MASKING_MODES.some((mode) => MODES[mode].withValidLastWord === this.#mode);
  }

  /** What its codes or shares hold, as a result says it. */
  get holds(): string {
    return this.masked ? PHRASE_WORDS.masked : PHRASE_WORDS.originalItself;
  }

  /** The label of the fingerprint of its codes. */
  get encodedFingerprintLabel(): string {
    return this.masked ? PHRASE_WORDS.encodedFingerprint : ENCODED_FINGERPRINT;
  }

  /** What a wrong date may give, by the mode's checksum rule. */
  get wrongDateWarning(): string | undefined {
    if (!this.masked) return undefined;
    const result = this.keepsChecksum
      ? "Wrong dates can still give a valid seed phrase."
      : "Wrong dates may fail the checksum or give a valid seed phrase.";
    return `${result} A valid checksum does not confirm the owner's wallet.`;
  }
}

/** How a form prints on cards: colours, or none. */
export type CardKind = "colors";

interface FormFacts {
  /** Hexadecimal digits of each code where the form writes its codes joined. */
  readonly joinedWidth?: number;
  readonly cardKind?: CardKind;
  readonly colors: boolean;
  /** English words and word numbers are the phrase itself unless masked. */
  readonly alwaysMasked: boolean;
}

const FORMS: Readonly<Record<EncodedFormat, FormFacts>> = Object.freeze({
  english: { colors: false, alwaysMasked: true },
  indexes: { colors: false, alwaysMasked: true },
  unicode: { joinedWidth: 4, cardKind: "colors", colors: false, alwaysMasked: false },
  "colors-unicode": { joinedWidth: 4, cardKind: "colors", colors: true, alwaysMasked: false },
  colors: { cardKind: "colors", colors: true, alwaysMasked: false },
});

/** One form's facts. */
export class EncodedForm {
  readonly #facts: FormFacts;

  private constructor(format: EncodedFormat) {
    this.#facts = FORMS[format];
  }

  static readonly #values = new Map(
    ENCODED_FORMATS.map((format) => [format, new EncodedForm(format)]),
  );

  static of(format: EncodedFormat): EncodedForm {
    const form = EncodedForm.#values.get(format);
    if (form === undefined) throw new Error("Choose a supported MnemoCode representation.");
    return form;
  }

  /**
   * The codes of `text` one by one, where the form writes them joined, so that a screen shows
   * where each code ends; undefined for a form whose codes are apart already.
   */
  apartCodes(text: string): string[] | undefined {
    const width = this.#facts.joinedWidth;
    if (width === undefined) return undefined;
    const joined = text.replace(/\s+/gu, "");
    return Array.from({ length: Math.ceil(joined.length / width) }, (_, at) =>
      joined.slice(at * width, (at + 1) * width),
    );
  }

  get cardKind(): CardKind | undefined {
    return this.#facts.cardKind;
  }

  /** Whether its codes are colours. */
  get writtenInColors(): boolean {
    return this.#facts.colors;
  }

  /** Whether MnemoCode writes a phrase in it only masked. */
  get alwaysMasked(): boolean {
    return this.#facts.alwaysMasked;
  }
}

/** Why a form that is always masked has no choice of not masking it, as MnemoCode says it. */
export const ALWAYS_MASKED_NOTE =
  "Always masked: unmasked, this form shows the seed phrase itself.";
/** What a copy of the other forms is worth without Seedshift. */
export const UNMASKED_NOTE = "weak: only disguised, anyone with MnemoCode reads it";

/** Whether MnemoCode writes `form` only masked. */
export function alwaysMasked(form: EncodedFormat): boolean {
  return EncodedForm.of(form).alwaysMasked;
}

/** Where other sets of codes and dates give the phrase found, that those found are one of them. */
export function foundAmongOthers(others: number): string {
  const sets = others + 1;
  return `${sets} ${sets === 1 ? "set" : "sets"} of codes and dates give this phrase; those found are one of them, so keep the dates you used.`;
}

/** What a result says after codes or shares were filled in, as MnemoCode says it. */
export const CORRECT_WRITTEN_COPY =
  "Correct the written copy; then check the wallet that comes back.";

/** The words of the search of codes marked with ?, as MnemoCode's decode says them. */
export const MISSING_CODES_TEXTS = Object.freeze({
  question: "How can MnemoCode tell the right codes?",
  many: "A fingerprint or an address tells the right codes among them.",
  noneByFingerprint: "No codes fit this fingerprint: check it, and the codes.",
  noneByWallet: "No codes give this wallet: check the dates, the wallet and the codes.",
  correct: CORRECT_WRITTEN_COPY,
  list: "Each line: the codes, the seed phrase they give, and its fingerprint with an empty BIP39 passphrase. Compare the fingerprint with your wallet.",
});
