// The quick known answers of card sets, built only with MnemoCode's card export. The shared
// feature owns its exact answers and refusals; drawing its PDF belongs to the full self-test.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { cardSetsSelfTest } from "../../recovery-mnemocode/source/export/card-sets-self-test.js";
import { readMnemoCodeCardAsset } from "./mnemocode-card-assets.js";
import { createMnemoCodeCardRenderer } from "./mnemocode-cards.js";
import { now } from "./self-test-helpers.js";

export function runMnemoCodeCardsSelfTest(): CryptoSelfTestReport {
  const started = now();
  // Constructing the renderer is passive: startup reads no asset and requests no host randomness.
  cardSetsSelfTest(createMnemoCodeCardRenderer(readMnemoCodeCardAsset)).startup();
  return {
    passed: true,
    checks: ["MnemoCode card set known answers"],
    durationMs: Math.round(now() - started),
  };
}
