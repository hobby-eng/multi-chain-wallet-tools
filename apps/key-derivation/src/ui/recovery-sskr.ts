import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from "@ckd/core/bip39.js";
import { describeUnknownError, freeThrownValue } from "@ckd/core/error-handling.js";
import { SskrGroupPolicy } from "@ckd/recovery-backup/sskr-groups.js";
import {
  createSskrShares,
  recoverSskrShares,
  type SskrShareEncoding,
} from "@ckd/recovery-backup/sskr.js";
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  lines,
  installThresholdGroupEditor,
  renderRecoveredMnemonic,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
  installFieldImports,
  QR_IMAGES_IMPORT,
} from "./recovery-workspace-shared.js";
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";

function selectedEncoding(selector: string): SskrShareEncoding {
  const value = required<HTMLSelectElement>(selector).value;
  if (value !== "compact-ur" && value !== "bytewords") throw new Error("Select an SSKR encoding.");
  return value;
}
function displayFailure(cause: unknown, fallback: string): string {
  const message = describeUnknownError(cause, fallback);
  freeThrownValue(cause);
  return message;
}

function installSskr(context: RecoveryFeatureContext): void {
  const groupThreshold = required<HTMLInputElement>("#sskr-group-threshold");
  const parameters = SskrGroupPolicy.parameters();
  groupThreshold.min = String(parameters.minimum);
  groupThreshold.max = String(parameters.maximumGroups);
  const groupEditor = installThresholdGroupEditor("#sskr-groups", {
    initial: [{ threshold: 2, count: 3 }],
    minimumRows: 1,
    layout: "table",
    help: "Each group creates a separate set of shares. First satisfy Shares required inside a group; then satisfy Groups required with that many completed groups. With Groups required set to 1, any one completed group can restore the secret.",
  });
  installSecretToggle("#toggle-sskr-source", "#sskr-source", "Show", "Hide", "recovery phrase");
  installMnemonicSourceDiagnostic(context, "sskr", "#sskr-source", "#toggle-sskr-source");
  installSecretToggle("#toggle-sskr-shares", "#sskr-shares", "Show", "Hide", "shares");
  installSecretToggle(
    "#toggle-sskr-created",
    "#sskr-create-result .share-secret",
    "Show shares",
    "Hide shares",
  );
  const created = required<HTMLElement>("#sskr-create-result");
  required<HTMLButtonElement>("#create-sskr").addEventListener("click", () => {
    created.replaceChildren();
    let entropy: Uint8Array | null = null;
    try {
      entropy = englishMnemonicToEntropy(context.readMnemonic("sskr", "#sskr-source"));
      const specs = groupEditor.read();
      const threshold = Number(groupThreshold.value);
      const shares = createSskrShares(
        entropy,
        threshold,
        specs,
        selectedEncoding("#sskr-create-encoding"),
      );
      renderSensitiveShares(
        created,
        shares,
        context.writeClipboard,
        [],
        [],
        () => context.jobs.ready,
      );
    } catch (e) {
      created.textContent = displayFailure(e, "SSKR creation failed.");
    } finally {
      entropy?.fill(0);
    }
  });
  const restored = required<HTMLElement>("#sskr-restore-result");
  required<HTMLButtonElement>("#restore-sskr").addEventListener("click", () => {
    restored.replaceChildren();
    let secret: Uint8Array | null = null;
    try {
      secret = recoverSskrShares(
        lines(required<HTMLTextAreaElement>("#sskr-shares").value),
        selectedEncoding("#sskr-restore-encoding"),
      );
      renderRecoveredMnemonic(
        restored,
        entropyToEnglishMnemonic(secret),
        context.writeClipboard,
        context.useMnemonicInDeriver,
        context.mnemonicToSeed,
      );
    } catch (e) {
      restored.textContent = displayFailure(e, "SSKR restoration failed.");
    } finally {
      secret?.fill(0);
    }
  });
  installFieldImports(
    required<HTMLTextAreaElement>("#sskr-shares"),
    (message) => (restored.textContent = message),
    { qr: QR_IMAGES_IMPORT },
  );
}

export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "sskr",
    panelId: "sskr-panel",
    phraseField: "#sskr-source",
    linkedNote: PHRASE_ONLY_NOTE,
  },
  install: installSskr,
};
