// The startup known answers of MnemoCode's sheet for heirs, built only with the card export, which
// offers the sheet: the words it prints for an encoded backup and for shares and the routes it
// refuses (MnemoCode's export/heir-sheet-self-test.ts). Text only, milliseconds; the PDF is drawn in
// the MnemoCode self-test that the person starts. Its test route prints an address without a
// scheme, so the page still holds no URL but its own.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { heirSheetSelfTest } from "../../recovery-mnemocode/source/export/heir-sheet-self-test.js";
import { readMnemoCodeCardAsset } from "./mnemocode-card-assets.js";
import { createMnemoCodeCardPlatform } from "./mnemocode-cards.js";
import { now } from "./self-test-helpers.js";

export function runMnemoCodeHeirsSelfTest(): CryptoSelfTestReport {
  const started = now();
  // Text only: the startup reads no asset.
  heirSheetSelfTest(createMnemoCodeCardPlatform(readMnemoCodeCardAsset)).startup();
  return {
    passed: true,
    checks: ["MnemoCode heir sheet known answers"],
    durationMs: Math.round(now() - started),
  };
}
