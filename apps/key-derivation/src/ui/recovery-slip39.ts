import { Slip39Create } from "./recovery-slip39-create.js";
import { Slip39Restore } from "./recovery-slip39-restore.js";
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  required,
  type RecoveryFeatureContext,
  installFieldImports,
  QR_IMAGES_IMPORT,
} from "./recovery-workspace-shared.js";
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
function installSlip39(context: RecoveryFeatureContext): void {
  installSecretToggle(
    "#toggle-slip39-source",
    "#slip39-source-mnemonic",
    "Show",
    "Hide",
    "recovery phrase",
  );
  installMnemonicSourceDiagnostic(
    context,
    "slip39",
    "#slip39-source-mnemonic",
    "#toggle-slip39-source",
  );
  installSecretToggle("#toggle-slip39-shares", "#slip39-shares", "Show", "Hide", "shares");
  installSecretToggle(
    "#toggle-slip39-created",
    "#slip39-create-result .share-secret",
    "Show shares",
    "Hide shares",
  );
  installFieldImports(
    required<HTMLTextAreaElement>("#slip39-shares"),
    (message) => (required<HTMLElement>("#slip39-restore-result").textContent = message),
    { qr: QR_IMAGES_IMPORT },
  );
  new Slip39Create(context);
  new Slip39Restore(context);
}

export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "slip39",
    panelId: "slip39-panel",
    phraseField: "#slip39-source-mnemonic",
    linkedNote: PHRASE_ONLY_NOTE,
  },
  install: installSlip39,
};
