// MnemoCode panel: converts a BIP39 phrase between words, word numbers, mapped Unicode and colors,
// directly or shifted by dates (Seedshift), with the MnemoCode core that tooling/sync-mnemocode-source.mjs
// vendors. Each part of the panel is its own class: Encode, Decode and the forgotten-word search.
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
import { MnemoCodeDecodeTab } from "./recovery-mnemocode-decode.js";
import { MnemoCodeEncodeTab } from "./recovery-mnemocode-encode.js";
import { MnemoCodeWordSearch } from "./recovery-mnemocode-words.js";
import {
  installMnemonicSourceDiagnostic,
  installSecretToggle,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

function installMnemoCode(context: RecoveryFeatureContext): void {
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
    "#mnemocode-encode-result .share-secret",
    "Show records",
    "Hide records",
  );
  installSecretToggle("#toggle-mnemocode-input", "#mnemocode-input", "Show", "Hide", "input");
  installSecretToggle(
    "#toggle-mnemocode-missing-word-input",
    "#mnemocode-missing-word-input",
    "Show",
    "Hide",
    "recovery phrase",
  );
  new MnemoCodeEncodeTab(context);
  new MnemoCodeDecodeTab(context);
  new MnemoCodeWordSearch(context);
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
