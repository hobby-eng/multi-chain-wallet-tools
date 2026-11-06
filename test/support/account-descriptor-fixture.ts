import type { AccountDescriptorExport } from "@ckd/core/types.js";

const PUBLIC = "pkh(xpub/0/*)\npkh(xpub/1/*)";
const PRIVATE = "pkh(xprv/0/*)\npkh(xprv/1/*)";

/** Synthetic descriptor wire data, never a valid extended key or an independent crypto answer. */
export class AccountDescriptorFixture {
  /** Fresh mutable result metadata, so a controller's Clear cannot alter another test's fixture. */
  static create(): AccountDescriptorExport {
    return {
      accountPath: "m/44h/5h/0h",
      publicText: PUBLIC,
      privateText: PRIVATE,
      scannerText: PUBLIC,
      fileStem: "synthetic-account",
    };
  }
}
