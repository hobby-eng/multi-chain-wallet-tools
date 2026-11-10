import { downloadBlob } from "@ckd/export/download.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** The first character a file name may hold: no control character. */
const FIRST_PRINTABLE_CHARACTER = 0x20;

/**
 * `name` as a file name that every system saves as it is, as MnemoCode admits one: not empty, no
 * path, no character a system refuses, no control character, no trailing dot or space, and none
 * of Windows's reserved names.
 */
function checkedExportFileName(name: unknown): string {
  if (
    typeof name !== "string" ||
    name === "" ||
    name === "." ||
    name === ".." ||
    /[/\\<>:"|?*]/u.test(name) ||
    Array.from(name).some(
      (character) => (character.codePointAt(0) ?? 0) < FIRST_PRINTABLE_CHARACTER,
    ) ||
    /[. ]$/u.test(name) ||
    /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/iu.test(name)
  )
    throw new Error("An export file name must be one safe path component.");
  return name;
}

/** MnemoCode downloads share filename admission and temporary byte ownership. */
export class MnemoCodeDownload {
  /** Copies borrowed bytes into a Blob and clears the temporary copy even if saving fails. */
  static bytes(bytes: Uint8Array, mimeType: string, fileName: unknown): void {
    const name = checkedExportFileName(fileName);
    const copy = new Uint8Array(bytes);
    try {
      downloadBlob(new Blob([copy], { type: mimeType }), name);
    } finally {
      copy.fill(0);
    }
  }

  /** Saves a Blob as it is, such as a photo whose saved bytes MnemoCode has read back. */
  static blob(blob: Blob, fileName: unknown): void {
    downloadBlob(blob, checkedExportFileName(fileName));
  }

  /** Admits the same safe filename before calling the workspace's gated text export. */
  static text(
    host: Pick<RecoveryFeatureContext, "downloadText">,
    text: string,
    fileName: unknown,
    mimeType: string,
  ): void {
    host.downloadText(text, checkedExportFileName(fileName), mimeType);
  }
}
