// The known answers of MnemoCode's share cards, for the page's MnemoCode self-test: share cards
// exist only in a build with both the card export and the SSKR library. The build puts
// mnemocode-share-card-checks-none.ts in place of this module otherwise
// (tooling/key-derivation-composition.mjs), so that such a build carries none of their checks.
import type { SelfTestFeature } from "../../recovery-mnemocode/source/core/self-test-check.js";
import type { CardDrawing } from "../../recovery-mnemocode/source/cards.js";
import { shareCardsSelfTest } from "../../recovery-mnemocode/source/export/sskr-render-self-test.js";

export const shareCardChecks: ((drawing: CardDrawing) => SelfTestFeature) | undefined =
  shareCardsSelfTest;
