// MnemoCode's sheet for heirs (its README, "Instructions for heirs") as the Deriver saves it: the
// words and the A5 or A6 layout are MnemoCode's (HeirPage of its WebAssembly); the Deriver supplies
// its route, the way through its own page to the seed phrase. The sheet holds no secret.
import { mnemocode } from "./mnemocode-engine.js";
import {
  Masking,
  type EncodedFormat,
  type MaskingMode,
  type ShareFormat,
} from "./mnemocode-facts.js";

/** The modes a sheet is made for: not the Original Seedshift with a valid last word. */
export type HeirMode = Exclude<MaskingMode, "seedshift-legacy-valid">;
/** The modes shares are split in. */
export type HeirShareMode = "direct" | "seedshift";

/**
 * The way through a page, as an heir finds it. Each step that is followed by the dates writes
 * {dates} there: MnemoCode puts ", then" and the dates in its place, or nothing where none are
 * asked.
 */
export interface HeirRoute {
  /** The line under the title: which program made the sheet. */
  readonly subtitle: string;
  /** The one address that the sheet prints, once, in the `start` steps. */
  readonly address: string;
  /** The steps that get the program and start it offline. */
  readonly start: readonly string[];
  /** The steps that open the restore of an encoded backup of `words` words made in `mode`. */
  decode(mode: HeirMode, words: number): readonly string[];
  /** The steps that open the restore from shares and type `threshold` of them. */
  restore(mode: HeirShareMode, threshold: number): readonly string[];
  /** What to do when a digit of a date cannot be read. */
  readonly dateDigitHelp: string | undefined;
}

/** What the sheet says of the backup: its kind and form, its mode and how many dates. */
export interface HeirSheetFacts {
  readonly backup:
    | { readonly kind: "encoded"; readonly format: EncodedFormat; readonly words: number }
    | {
        readonly kind: "shares";
        readonly format: ShareFormat;
        readonly threshold: number;
        readonly count: number;
        /** The codes of one share on its cards, before the decoys, where its form has cards. */
        readonly codes?: number;
      };
  readonly mode: HeirMode;
  readonly dates: number;
}

/** The two sizes that MnemoCode lays the sheet out in. */
export type HeirSheetSize = "a5" | "a6";

const HEIR_SHEET_FILE = "mnemocode-heirs.pdf";

export class MnemoCodeHeirSheets {
  readonly #route: HeirRoute;

  constructor(route: HeirRoute) {
    this.#route = route;
  }

  /** Whether a backup made in `mode` can have a sheet: not one whose last word was replaced. */
  static supports(mode: MaskingMode): mode is HeirMode {
    return Masking.of(mode).capabilities.heirSheet;
  }

  /** The sheet for `facts`, two pages of `size`, as a PDF file. */
  render(
    facts: HeirSheetFacts,
    size: HeirSheetSize,
  ): { readonly fileName: string; readonly bytes: Uint8Array } {
    const { backup, mode, dates } = facts;
    const steps =
      backup.kind === "encoded"
        ? this.#route.decode(mode, backup.words)
        : this.#route.restore(mode === "seedshift" ? "seedshift" : "direct", backup.threshold);
    using page = new (mnemocode().HeirPage)(
      this.#route.subtitle,
      this.#route.address,
      [...this.#route.start],
      [...steps],
      this.#route.dateDigitHelp,
      size,
    );
    const bytes =
      backup.kind === "encoded"
        ? page.encodedSheet(backup.format, backup.words, mode, dates)
        : page.sharesSheet(
            backup.format,
            backup.threshold,
            backup.count,
            backup.codes ?? Number.NaN,
            mode,
            dates,
          );
    return { fileName: HEIR_SHEET_FILE, bytes };
  }
}
