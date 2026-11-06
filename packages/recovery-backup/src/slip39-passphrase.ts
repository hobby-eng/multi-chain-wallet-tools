import { ErrorCatalog } from "@ckd/core/error-catalog.js";

const ENCODER = new TextEncoder();
const PRINTABLE_ASCII_MIN = 32;
const PRINTABLE_ASCII_MAX = 126;
const ERRORS = new ErrorCatalog("wallet.slip39-passphrase", {
  type: { kind: "type", text: () => "A SLIP-39 passphrase must be text or encoded bytes." },
  ascii: () => "A SLIP-39 passphrase may contain printable ASCII characters only.",
});

/** One ASCII admission rule for preflight and stretching; no passphrase value enters diagnostics. */
export class Slip39Passphrase {
  /** Checks borrowed bytes directly, without making an unwipeable array of their numeric values. */
  static assert(bytes: Uint8Array): void {
    if (!(bytes instanceof Uint8Array)) throw ERRORS.create("type", []);
    if (bytes.some((byte) => byte < PRINTABLE_ASCII_MIN || byte > PRINTABLE_ASCII_MAX))
      throw ERRORS.create("ascii", []);
  }

  /** Returns caller-owned encoded bytes; an admission failure wipes the allocated buffer. */
  static encode(text: string): Uint8Array<ArrayBuffer> {
    if (typeof text !== "string") throw ERRORS.create("type", []);
    const bytes = ENCODER.encode(text);
    try {
      this.assert(bytes);
      return bytes;
    } catch (cause) {
      bytes.fill(0);
      throw cause;
    }
  }
}
