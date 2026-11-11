// A Standard SeedQR hidden in a decoy QR: MnemoCode's hidden QR (docs/HIDDEN_QR.md) whose visible
// text is a decoy, such as a contact card, and whose hidden record is the Standard SeedQR's digits,
// exact UTF-8 text. CompactSeedQR is raw bytes, not text, so it is never hidden. Ordinary scanners
// show the decoy; SeedSigner and other wallets cannot read the SeedQR (they show the decoy or
// reject the code); this Deriver, or MnemoCode's qr-open followed by SeedQR decoding, reads the
// record. It is camouflage, not encryption. Built only with MnemoCode.
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { hiddenQrPng, readHiddenQrRecord } from "./mnemocode-hidden-qr.js";
import { encodeStandardSeedQr, isStandardSeedQr } from "./seedqr.js";

const ERRORS = new ErrorCatalog("backup.hidden-seedqr", {
  "not-seedqr": () =>
    "This QR's hidden record is not a Standard SeedQR. A hidden QR of a MnemoCode backup opens in the MnemoCode tab.",
});

/**
 * One hidden SeedQR: its decoy text and the PNG that MnemoCode made of it, which holds the phrase.
 * The PNG is borrowed by its readers and wiped by wipe() as far as the runtime allows.
 */
export class HiddenSeedQr implements Disposable {
  /** What ordinary scanners show: not secret. */
  readonly visible: string;
  /** The hidden record, the Standard SeedQR digits: secret, and text that no wipe() can reach. */
  readonly record: string;
  readonly #png: Uint8Array;

  /**
   * The Standard SeedQR of `mnemonic` hidden behind `visible`. Refuses an invalid phrase as the
   * SeedQR encoder does, and what MnemoCode refuses: an empty text, or texts that do not fit one
   * QR together (at most 2324 bytes at version 40-M, code export.qr-image.capacity).
   */
  constructor(mnemonic: string, visible: string) {
    this.visible = visible;
    this.record = encodeStandardSeedQr(mnemonic);
    this.#png = hiddenQrPng(visible, this.record);
  }

  /** The PNG, borrowed until wipe(): print or save it as it is, never a QR made again. */
  get png(): Uint8Array {
    return this.#png;
  }

  wipe(): void {
    this.#png.fill(0);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/**
 * The Standard SeedQR digits that a PNG keeps as its hidden record; undefined where it keeps none,
 * so that the image is read as an ordinary QR, and `unread` is told why where MnemoCode could not
 * look (readHiddenQrRecord). Any other hidden record is refused (code
 * backup.hidden-seedqr.not-seedqr), without repeating it; the spaces around the digits are left
 * out, as a record saved by MnemoCode's qr-hide from a file may end in a line break.
 */
export function readHiddenSeedQr(
  png: Uint8Array,
  unread?: (reason: string) => void,
): string | undefined {
  const record = readHiddenQrRecord(png, unread);
  if (record === undefined) return undefined;
  const digits = record.trim();
  if (!isStandardSeedQr(digits)) throw ERRORS.create("not-seedqr", []);
  return digits;
}
