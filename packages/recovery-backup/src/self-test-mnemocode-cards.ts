// The startup known answers of MnemoCode's cards, built only with the card export: the cards part
// of its WebAssembly runs its startup cases (selfCheckCards), the heir sheet's and the share
// cards' among them. Drawing whole sheets belongs to the full self-test.
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { loadMnemoCode } from "./mnemocode-module.js";
import { now } from "./self-test-helpers.js";

export async function runMnemoCodeCardsSelfTest(): Promise<CryptoSelfTestReport> {
  const started = now();
  (await loadMnemoCode()).selfCheckCards(false);
  return {
    passed: true,
    checks: ["MnemoCode card, heir sheet and share card known answers"],
    durationMs: Math.round(now() - started),
  };
}
