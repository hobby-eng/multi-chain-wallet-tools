// MnemoCode's QR codes with a hidden record (MnemoCode docs/HIDDEN_QR.md): ordinary scanners show
// a public text, such as a contact card, and MnemoCode reads the exact backup record kept after the
// QR's terminator. It is camouflage, not encryption: anyone who knows the public format reads it.
import { errorCode } from "@ckd/core/refusal.js";
import { mnemocode } from "./mnemocode-engine.js";
import { MnemoCodeInputAdmission } from "./mnemocode-input.js";

/** The refusal of a PNG that keeps no hidden record, which is then read as an ordinary QR. */
const NO_HIDDEN_RECORD = "export.qr-image.no-hidden-record";

/**
 * The hidden record a QR's PNG keeps; undefined where it keeps none, so that the image is read as
 * an ordinary QR code. Other refusals, of a damaged record or an unreadable PNG, are MnemoCode's.
 */
export function readHiddenQrRecord(png: Uint8Array): string | undefined {
  try {
    return mnemocode().readHiddenQrPng(png);
  } catch (cause) {
    if (errorCode(cause) === NO_HIDDEN_RECORD) return undefined;
    throw cause;
  }
}

/** A PNG whose ordinary scanners show `visible` and whose hidden record is `record`, exactly. */
export function hiddenQrPng(visible: string, record: string): Uint8Array {
  MnemoCodeInputAdmission.assertSize(visible, "MnemoCode input");
  MnemoCodeInputAdmission.assertSize(record, "MnemoCode input");
  return mnemocode().hiddenQrPng(visible, record);
}

/** What the page says beside a hidden QR, in the words of MnemoCode's guide. */
export const HIDDEN_QR_NOTE =
  "A hidden QR is camouflage, not encryption: a raw-codeword tool can detect its padding and anyone who knows the public format reads the record. Never put masking dates or other private information in the visible text. Print the original QR at actual size: a QR made again from its visible text loses the hidden record.";
