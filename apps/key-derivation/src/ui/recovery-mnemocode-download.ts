import { downloadBlob } from "@ckd/export/download.js";
import { ExportFileName } from "../../../../packages/recovery-mnemocode/source/export/file-name.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";

/** MnemoCode downloads share filename admission and temporary byte ownership. */
export class MnemoCodeDownload {
  /** Copies borrowed bytes into a Blob and clears the temporary copy even if saving fails. */
  static bytes(bytes: Uint8Array, mimeType: string, fileName: unknown): void {
    const name = ExportFileName.checked(fileName);
    const copy = new Uint8Array(bytes);
    try {
      downloadBlob(new Blob([copy], { type: mimeType }), name);
    } finally {
      copy.fill(0);
    }
  }

  /** Admits the same safe filename before calling the workspace's gated text export. */
  static text(
    host: Pick<RecoveryFeatureContext, "downloadText">,
    text: string,
    fileName: unknown,
    mimeType: string,
  ): void {
    host.downloadText(text, ExportFileName.checked(fileName), mimeType);
  }
}
