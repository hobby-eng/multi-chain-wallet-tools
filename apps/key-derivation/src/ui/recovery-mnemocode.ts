// MnemoCode panel: converts a BIP39 phrase between words, word numbers, mapped Unicode and colors,
// directly or shifted by dates (Seedshift), with the MnemoCode core that tooling/sync-mnemocode-source.mjs
// vendors. Each tab of the panel is its own class: Encode, Decode, Forgotten, Word table and
// Self-test; the shares are a module of their own (recovery-mnemocode-shares.ts).
import { WordList } from "../../../../packages/recovery-mnemocode/source/core/word-hints.js";
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
import { MnemoCodeDecodeTab } from "./recovery-mnemocode-decode.js";
import { MnemoCodeEncodeTab } from "./recovery-mnemocode-encode.js";
import { MnemoCodeReEncodeTab } from "./recovery-mnemocode-reencode.js";
import { MnemoCodeForgottenTab } from "./recovery-mnemocode-forgotten.js";
import { MnemoCodeSelfTestTab } from "./recovery-mnemocode-self-test.js";
import { MnemoCodeWordTableTab } from "./recovery-mnemocode-word-table.js";
import { attachMnemoCodeWordHints } from "./recovery-mnemocode-word-hints.js";
import {
  installMnemonicSourceDiagnostic,
  installSecretToggle,
  required,
  shownTextsIn,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

function installMnemoCode(context: RecoveryFeatureContext): void {
  attachMnemoCodeWordHints(required<HTMLTextAreaElement>("#mnemocode-source"), WordList.BIP39);
  installSecretToggle(
    "#toggle-mnemocode-source",
    "#mnemocode-source",
    "Show",
    "Hide",
    "recovery phrase",
  );
  installMnemonicSourceDiagnostic(
    context,
    "mnemocode",
    "#mnemocode-source",
    "#toggle-mnemocode-source",
  );
  installSecretToggle(
    "#toggle-mnemocode-created",
    shownTextsIn("#mnemocode-encode-result"),
    "Show records",
    "Hide records",
  );
  installSecretToggle("#toggle-mnemocode-input", "#mnemocode-input", "Show", "Hide", "input");
  new MnemoCodeEncodeTab(context);
  new MnemoCodeReEncodeTab(context);
  new MnemoCodeDecodeTab(context);
  new MnemoCodeForgottenTab(context);
  new MnemoCodeWordTableTab(context);
  new MnemoCodeSelfTestTab(context);
}

export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "mnemocode",
    panelId: "mnemocode-panel",
    phraseField: "#mnemocode-source",
    linkedNote: PHRASE_ONLY_NOTE,
  },
  install: installMnemoCode,
};
