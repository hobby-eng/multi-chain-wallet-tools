// The startup known answers of MnemoCode's share cards, built only with the card export and the
// SSKR library together: the codes that share cards print (MnemoCode's
// export/sskr-render-self-test.ts), with its fixed decorative colours, so it needs no render
// platform. Milliseconds; the PDFs themselves are drawn in the MnemoCode self-test that the person
// starts.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { shareCardsSelfTest } from "../../recovery-mnemocode/source/export/sskr-render-self-test.js";
import { readMnemoCodeCardAsset } from "./mnemocode-card-assets.js";
import { createMnemoCodeCardRenderer } from "./mnemocode-cards.js";
import { now } from "./self-test-helpers.js";

export function runMnemoCodeShareCardsSelfTest(): CryptoSelfTestReport {
  const started = now();
  // The startup reads no asset and makes no random choice; building the renderer reads nothing.
  shareCardsSelfTest(createMnemoCodeCardRenderer(readMnemoCodeCardAsset)).startup();
  return {
    passed: true,
    checks: ["MnemoCode share card known answers"],
    durationMs: Math.round(now() - started),
  };
}
