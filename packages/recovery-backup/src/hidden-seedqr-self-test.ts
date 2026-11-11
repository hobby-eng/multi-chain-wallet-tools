// The hidden SeedQR's check in MnemoCode's self-test run, on the person's button press (the
// MnemoCode Self-test tab and the page's full self-test): the Standard SeedQR of the public BIP39
// test phrase hidden behind a synthetic contact card and read back both ways, an ordinary QR read
// as none, and a hidden record that is no SeedQR refused. The decoy texts have their startup known
// answers (self-test-decoy-qr-text.ts).
import { errorCode } from "@ckd/core/refusal.js";
import { HiddenSeedQr, readHiddenSeedQr } from "./hidden-seedqr.js";
import { mnemocode } from "./mnemocode-engine.js";
import { hiddenQrPng } from "./mnemocode-hidden-qr.js";
import type { SelfTestCheck } from "./mnemocode-self-test.js";
import { PUBLIC_CONTACT_TEXT } from "./self-test-decoy-qr-text.js";
import { expectText } from "./self-test-helpers.js";

const PUBLIC_MNEMONIC = `${"abandon ".repeat(11)}about`;
/** Its Standard SeedQR: "abandon" is word 0 of the BIP39 list and "about" word 3. */
const PUBLIC_SEEDQR = `${"0000".repeat(11)}0003`;
/** A MnemoCode record of the same public phrase: a hidden record, but no SeedQR. */
const OTHER_RECORD = "MNC1:direct:indexes:1 1 1 1 1 1 1 1 1 1 1 4";
const NOT_SEEDQR = "backup.hidden-seedqr.not-seedqr";

function checkHiddenSeedQr(): void {
  using hidden = new HiddenSeedQr(PUBLIC_MNEMONIC, PUBLIC_CONTACT_TEXT);
  const ordinary = mnemocode().qrPng(PUBLIC_SEEDQR);
  const other = hiddenQrPng(PUBLIC_CONTACT_TEXT, OTHER_RECORD);
  try {
    expectText(
      "Hidden SeedQR visible text",
      mnemocode().readQrPng(hidden.png),
      PUBLIC_CONTACT_TEXT,
    );
    expectText("Hidden SeedQR record", readHiddenSeedQr(hidden.png) ?? "", PUBLIC_SEEDQR);
    expectText("Ordinary SeedQR read as none", readHiddenSeedQr(ordinary) ?? "none", "none");
    let refused = false;
    try {
      readHiddenSeedQr(other);
    } catch (cause) {
      if (errorCode(cause) !== NOT_SEEDQR) throw cause;
      refused = true;
    }
    expectText("Hidden record that is no SeedQR", String(refused), "true");
  } finally {
    ordinary.fill(0);
    other.fill(0);
  }
}

/** The check that the hidden SeedQR adds to MnemoCode's self-test run. */
export const HIDDEN_SEEDQR_CHECK: SelfTestCheck = {
  name: "Hidden SeedQR",
  detail: "a SeedQR behind a contact card read back both ways, an ordinary QR, a record refused",
  run: checkHiddenSeedQr,
};
