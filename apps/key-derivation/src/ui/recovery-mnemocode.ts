// MnemoCode panel: converts a BIP39 phrase between words, word numbers, mapped Unicode and colors,
// directly or shifted by dates (Seedshift), with MnemoCode's WebAssembly
// (packages/recovery-mnemocode-wasm). Each tab of the panel is its own class: Encode, Decode,
// Forgotten, Photo or MP3, Word table and Self-test; Encode's cross-stitch pattern is a class of its
// own, and the shares are a module of their own (recovery-mnemocode-shares.ts).
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
import { MnemoCodeDecodeTab } from "./recovery-mnemocode-decode.js";
import { MnemoCodeEncodeTab } from "./recovery-mnemocode-encode.js";
import { MnemoCodeReEncodeTab } from "./recovery-mnemocode-reencode.js";
import { MnemoCodeForgottenTab } from "./recovery-mnemocode-forgotten.js";
import { MnemoCodeSelfTestTab } from "./recovery-mnemocode-self-test.js";
import { MnemoCodeStitchSection } from "./recovery-mnemocode-stitch.js";
import { MnemoCodeStegoTab } from "./recovery-mnemocode-stego.js";
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
  attachMnemoCodeWordHints(required<HTMLTextAreaElement>("#mnemocode-source"), "phrase");
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
  installSecretToggle(
    "#toggle-mnemocode-stitch-result",
    shownTextsIn("#mnemocode-stitch-result"),
    "Show legend",
    "Hide legend",
  );
  installSecretToggle("#toggle-mnemocode-input", "#mnemocode-input", "Show", "Hide", "input");
  installSecretToggle(
    "#toggle-mnemocode-stego-opened",
    shownTextsIn("#mnemocode-stego-open-result"),
    "Show contents",
    "Hide contents",
  );
  new MnemoCodeEncodeTab(context);
  new MnemoCodeStitchSection(context);
  new MnemoCodeReEncodeTab(context);
  new MnemoCodeDecodeTab(context);
  new MnemoCodeForgottenTab(context);
  new MnemoCodeStegoTab(context);
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
