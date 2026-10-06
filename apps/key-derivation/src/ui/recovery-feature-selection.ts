// Stand-in for type checking. The build replaces this module with one that imports only the
// features its flags select (apps/key-derivation/scripts/build-key-derivation-html.mjs).
import type { RecoveryFeature } from "./recovery-feature.js";
import { recoveryFeature as codex32 } from "./recovery-codex32.js";
import { recoveryFeature as gordianEnvelope } from "./recovery-gordian-envelope.js";
import { recoveryFeature as mhfe } from "./recovery-mhfe.js";
import { recoveryFeature as mnemoCode } from "./recovery-mnemocode.js";
import { recoveryFeature as mnemoCodeCards } from "./recovery-mnemocode-cards.js";
import { recoveryFeature as seedQr } from "./recovery-seedqr.js";
import { recoveryFeature as slip39 } from "./recovery-slip39.js";
import { recoveryFeature as sskr } from "./recovery-sskr.js";
import { recoveryFeature as walletMatcher } from "./recovery-wallet-matcher.js";

export const selectedRecoveryFeatures: readonly RecoveryFeature[] = [
  walletMatcher,
  seedQr,
  mnemoCode,
  mnemoCodeCards,
  mhfe,
  slip39,
  codex32,
  sskr,
  gordianEnvelope,
];
