// MnemoCode's QR codes with a hidden record (MnemoCode docs/HIDDEN_QR.md): ordinary scanners show
// a public text, such as a contact card, and MnemoCode reads the exact backup record kept after the
// QR's terminator. It is camouflage, not encryption: anyone who knows the public format reads it.
import { errorCode } from "@ckd/core/refusal.js";
import { mnemocode, mnemocodeState } from "./mnemocode-engine.js";
import { MnemoCodeInputAdmission } from "./mnemocode-input.js";

/** The refusal of a PNG that keeps no hidden record, which is then read as an ordinary QR. */
const NO_HIDDEN_RECORD = "export.qr-image.no-hidden-record";
/**
 * MnemoCode's own PNG admission. It reads at most 4096 pixels a side and 2 megapixels, less than
 * the page's QR import (8 megapixels, packages/shared-ui/src/png-rules.ts), so a PNG it refuses is
 * read as an ordinary QR and the page's admission judges the file.
 */
const PNG_ADMISSION = "core.png-admission.";
/** The refusal of a PNG beyond MnemoCode's 4096 pixels a side or 2 megapixels. */
const PNG_TOO_LARGE = `${PNG_ADMISSION}qr-png-dimensions-exceed-px-megapixel-safety-limit`;
/** The widest and tallest PNG, in pixels, that MnemoCode reads a hidden record from. */
const HIDDEN_RECORD_SIDE_PIXELS = 4096;
/** The most megapixels of a PNG that MnemoCode reads a hidden record from. */
const HIDDEN_RECORD_MEGAPIXELS = 2;

/** Why a hidden record went unread, for the page to say beside what the image gave instead. */
const UNREAD = {
  tooLarge: `A hidden record is read only from a PNG of at most ${HIDDEN_RECORD_SIDE_PIXELS} pixels a side and ${HIDDEN_RECORD_MEGAPIXELS} megapixels: use the original PNG, or a crop of the QR.`,
  loading: "MnemoCode is still loading: choose the image again in a moment.",
  stopped: "A hidden record was not looked for: MnemoCode is off until the page is loaded again.",
} as const;

/**
 * The hidden record a QR's PNG keeps; undefined where it keeps none, so that the image is read as
 * an ordinary QR code. A PNG that MnemoCode does not admit, such as one above 2 megapixels, and any
 * PNG while MnemoCode is still loading or stopped after an internal error, are read as keeping none
 * too, and `unread` is told why, for the page to say. The refusals that remain, of a PNG stream
 * that cannot be read or a file over 16 MiB, are MnemoCode's.
 */
export function readHiddenQrRecord(
  png: Uint8Array,
  unread: (reason: string) => void = () => undefined,
): string | undefined {
  try {
    return mnemocode().readHiddenQrPng(png);
  } catch (cause) {
    const code = errorCode(cause);
    if (code === NO_HIDDEN_RECORD) return undefined;
    if (code === PNG_TOO_LARGE) unread(UNREAD.tooLarge);
    else if (code?.startsWith(PNG_ADMISSION) !== true) {
      // MnemoCode still loading, stopped before, or stopped by this very read.
      const state = mnemocodeState();
      if (state === "ready") throw cause;
      unread(UNREAD[state]);
    }
    return undefined;
  }
}

/** A PNG whose ordinary scanners show `visible` and whose hidden record is `record`, exactly. */
export function hiddenQrPng(visible: string, record: string): Uint8Array {
  MnemoCodeInputAdmission.assertSize(visible, "MnemoCode input");
  MnemoCodeInputAdmission.assertSize(record, "MnemoCode input");
  return mnemocode().hiddenQrPng(visible, record);
}

/** The note beside a hidden QR in MnemoCode's words, naming what to keep out of its visible text. */
function hiddenQrNote(keptOut: string): string {
  return `A hidden QR is camouflage, not encryption: a raw-codeword tool can detect its padding and anyone who knows the public format reads the record. Never put ${keptOut} in the visible text. Print the original QR at actual size: a QR made again from its visible text loses the hidden record.`;
}

/** What the page says beside a hidden QR, in the words of MnemoCode's guide. */
export const HIDDEN_QR_NOTE = hiddenQrNote("masking dates or other private information");

/** The same note beside a hidden QR whose record has no masking dates, such as a hidden SeedQR. */
export const HIDDEN_QR_NOTE_WITHOUT_DATES = hiddenQrNote("private information");
