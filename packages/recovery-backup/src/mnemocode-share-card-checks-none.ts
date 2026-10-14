// A build without the SSKR library prints no share cards, so it has no checks of them; the build
// puts this module in place of mnemocode-share-card-checks.ts.
import type { SelfTestFeature } from "../../recovery-mnemocode/source/core/self-test-check.js";
import type { CardDrawing } from "../../recovery-mnemocode/source/cards.js";

export const shareCardChecks: ((drawing: CardDrawing) => SelfTestFeature) | undefined = undefined;
