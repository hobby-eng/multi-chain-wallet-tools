import {
  CORRECT_WRITTEN_COPY,
  EncodedForm,
  type ShareFormat,
} from "@ckd/recovery-backup/mnemocode-facts.js";
import { paragraph } from "./recovery-workspace-shared.js";
import { MNEMOCODE_FINGERPRINT_NOTICE } from "./recovery-mnemocode-help.js";

/** What heads a repair report, as MnemoCode says it. */
const REPAIRED = "Filled in where ? stood:";

/** Renders share reports and owns their shared presentation and export facts. */
export class ShareResultView {
  /** Default text export name for a split or repaired share set. */
  static readonly FILE_NAME = "mnemocode-shares.txt";
  /** Wording shared by every share result that shows BIP32 fingerprints. */
  static readonly FINGERPRINT_NOTE = `BIP32 master key fingerprints for an empty BIP39 passphrase. ${MNEMOCODE_FINGERPRINT_NOTICE}`;

  /** Native paragraphs for MnemoCode's result lines. */
  static notes(texts: readonly string[], className = "field-note"): HTMLElement[] {
    return texts.map((text) => paragraph(text, className));
  }

  /**
   * What a repair filled in where ? stood, MnemoCode's lines, one for each share, in one callout;
   * then that the written copy is to be corrected. Nothing when no ? was typed.
   */
  static repairs(lines: readonly string[]): HTMLElement[] {
    if (lines.length === 0) return [];
    const callout = document.createElement("div");
    callout.className = "warning-callout mnemocode-repairs";
    const heading = document.createElement("p");
    heading.textContent = REPAIRED;
    const list = document.createElement("ul");
    for (const line of lines) {
      const item = document.createElement("li");
      item.textContent = line;
      list.append(item);
    }
    callout.append(heading, list);
    return [callout, paragraph(CORRECT_WRITTEN_COPY, "field-note")];
  }

  /** The codes of a share one by one, where its form writes them joined. */
  static apartCodes(share: string, format: ShareFormat): string[] | undefined {
    return format === "unicode" || format === "colors-unicode"
      ? EncodedForm.of(format).apartCodes(share)
      : undefined;
  }
}
