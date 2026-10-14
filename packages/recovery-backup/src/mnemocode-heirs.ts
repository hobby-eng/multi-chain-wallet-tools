// MnemoCode's sheet for heirs (its README, "Instructions for heirs") as the Deriver saves it: the
// words are MnemoCode's (export/heir-sheet-text.ts), the A5 or A6 layout too (export/heir-sheet.ts).
// The Deriver supplies its route, the way through its own page to the seed phrase, and the render
// platform of its card export, which holds the sheet's font. The sheet holds no secret.
import { capabilities } from "../../recovery-mnemocode/source/core/backup-options.js";
import type { RecordMode } from "../../recovery-mnemocode/source/record.js";
import {
  A5,
  A6,
  HEIR_SHEET_FILE,
  renderHeirSheet,
} from "../../recovery-mnemocode/source/export/heir-sheet.js";
import {
  HeirInstructions,
  type HeirRoute,
  type HeirSheetFacts,
} from "../../recovery-mnemocode/source/export/heir-sheet-text.js";
import type { RenderPlatform } from "../../recovery-mnemocode/source/export/platform.js";
import { createMnemoCodeCardPlatform, type MnemoCodeCardAssetReader } from "./mnemocode-cards.js";

export type { HeirRoute, HeirSheetFacts };

/** The two sizes that MnemoCode lays the sheet out in. */
export type HeirSheetSize = "a5" | "a6";

export class MnemoCodeHeirSheets {
  readonly #instructions: HeirInstructions;
  readonly #platform: RenderPlatform;

  constructor(route: HeirRoute, readAsset: MnemoCodeCardAssetReader) {
    this.#instructions = new HeirInstructions(route);
    this.#platform = createMnemoCodeCardPlatform(readAsset);
  }

  /** Whether a backup made in `mode` can have a sheet: not one whose last word was replaced. */
  static supports(mode: RecordMode): boolean {
    return capabilities(mode).heirSheet;
  }

  /** The sheet for `facts`, two pages of `size`, as a PDF file. */
  async render(
    facts: HeirSheetFacts,
    size: HeirSheetSize,
  ): Promise<{ readonly fileName: string; readonly bytes: Uint8Array }> {
    const bytes = await renderHeirSheet(
      this.#platform,
      this.#instructions.text(facts),
      size === "a6" ? A6 : A5,
    );
    return { fileName: HEIR_SHEET_FILE, bytes };
  }
}
