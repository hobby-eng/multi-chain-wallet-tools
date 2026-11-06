import { RenderedSecrets } from "./secrets.js";
import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from "@ckd/core/bip39.js";
import { BIP39_ENTROPY_BYTES } from "@ckd/core/bip39-parameters.js";
import { orList } from "@ckd/core/listing.js";
import {
  Codex32Identifier,
  createCodex32Shares,
  recoverCodex32Shares,
} from "@ckd/recovery-backup/codex32.js";
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  integer,
  lines,
  renderRecoveredMnemonic,
  renderRecoveredSeed,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
  installFieldImports,
  QR_IMAGES_IMPORT,
} from "./recovery-workspace-shared.js";
import type { RecoveryFeature } from "./recovery-feature.js";
/** Owns the native controls and independent backup and restore operations. */
export class Codex32Feature {
  readonly #context: RecoveryFeatureContext;
  readonly #codex32SecretType: HTMLSelectElement;
  readonly #codex32RestoreType: HTMLSelectElement;
  readonly #codex32Passphrase: HTMLInputElement;
  readonly #codex32SecretTypeNote: HTMLElement;
  readonly #codex32ContentWarning: HTMLElement;
  readonly #codex32Identifier: HTMLInputElement;
  readonly #codex32Threshold: HTMLInputElement;
  readonly #codex32Count: HTMLInputElement;
  readonly #codex32Unsplit: HTMLInputElement;
  readonly #codex32CreateResult: HTMLElement;
  readonly #codex32RestoreResult: HTMLElement;
  /** Bind controls; every secret operation admits the current readiness gate. */
  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#codex32SecretType = required<HTMLSelectElement>("#codex32-secret-type");
    this.#codex32RestoreType = required<HTMLSelectElement>("#codex32-restore-type");
    this.#codex32Passphrase = required<HTMLInputElement>("#codex32-passphrase");
    this.#codex32SecretTypeNote = required<HTMLElement>("#codex32-secret-type-note");
    this.#codex32ContentWarning = required<HTMLElement>("#codex32-content-warning");
    this.#codex32Identifier = required<HTMLInputElement>("#codex32-identifier");
    this.#codex32Threshold = required<HTMLInputElement>("#codex32-threshold");
    this.#codex32Count = required<HTMLInputElement>("#codex32-count");
    this.#codex32Unsplit = required<HTMLInputElement>("#codex32-unsplit");
    this.#codex32CreateResult = required<HTMLElement>("#codex32-create-result");
    this.#codex32RestoreResult = required<HTMLElement>("#codex32-restore-result");
    this.#installControls();
  }
  #installControls(): void {
    installSecretToggle(
      "#toggle-codex32-source",
      "#codex32-source",
      "Show",
      "Hide",
      "recovery phrase",
    );
    installMnemonicSourceDiagnostic(
      this.#context,
      "codex32",
      "#codex32-source",
      "#toggle-codex32-source",
      "#codex32-passphrase",
    );
    installSecretToggle("#toggle-codex32-shares", "#codex32-shares", "Show", "Hide", "records");
    installSecretToggle(
      "#toggle-codex32-created",
      "#codex32-create-result .share-secret",
      "Show records",
      "Hide records",
    );
    installFieldImports(
      required<HTMLTextAreaElement>("#codex32-shares"),
      (message) => RenderedSecrets.text(this.#codex32RestoreResult, message),
      { qr: QR_IMAGES_IMPORT },
    );
    this.#codex32SecretType.addEventListener("change", this.#synchronizeCodex32SecretType);
    this.#synchronizeCodex32SecretType();
    this.#codex32Identifier.addEventListener("input", this.#synchronizeIdentifier);
    this.#synchronizeIdentifier();
    this.#codex32Unsplit.addEventListener("change", () => {
      this.#codex32Threshold.disabled = this.#codex32Unsplit.checked;
      this.#codex32Count.disabled = this.#codex32Unsplit.checked;
    });
    required<HTMLButtonElement>("#create-codex32").addEventListener("click", this.#create);
    required<HTMLButtonElement>("#restore-codex32").addEventListener("click", this.#restore);
  }
  readonly #synchronizeCodex32SecretType = (): void => {
    const storesEntropy = this.#codex32SecretType.value === "bip39-entropy";
    this.#codex32Passphrase.disabled = storesEntropy;
    this.#codex32SecretTypeNote.textContent = storesEntropy
      ? "Stores the phrase entropy and checksum length. The separate BIP39 passphrase is not included."
      : "Applies the exact Unicode BIP39 passphrase and stores the resulting 64-byte wallet seed.";
    this.#codex32ContentWarning.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = storesEntropy ? "Recovery-phrase backup." : "One-way source conversion.";
    this.#codex32ContentWarning.append(
      title,
      document.createTextNode(
        storesEntropy
          ? " Restoring these records reconstructs the original English BIP39 words. Keep any BIP39 passphrase separately."
          : " The same BIP32 wallet seed is restored, but PBKDF2 prevents reconstructing the original words or passphrase.",
      ),
    );
  };
  readonly #synchronizeIdentifier = (): void => {
    try {
      this.#codex32Identifier.value = new Codex32Identifier(this.#codex32Identifier.value).value;
      this.#codex32Identifier.setCustomValidity("");
      this.#codex32Identifier.setAttribute("aria-invalid", "false");
    } catch (cause) {
      this.#codex32Identifier.setCustomValidity(
        cause instanceof Error ? cause.message : String(cause),
      );
      this.#codex32Identifier.setAttribute("aria-invalid", "true");
    }
  };
  readonly #create = () => {
    this.#codex32CreateResult.replaceChildren();
    let secretData: Uint8Array | undefined;
    try {
      this.#context.jobs.assertReady();
      const linked = this.#context.linkedValue("codex32");
      const mnemonic =
        linked?.mnemonic ?? required<HTMLTextAreaElement>("#codex32-source").value.trim();
      const entropy = englishMnemonicToEntropy(mnemonic);
      if (this.#codex32SecretType.value === "bip39-entropy") {
        secretData = entropy;
      } else {
        entropy.fill(0);
        secretData = this.#context.mnemonicToSeed(
          mnemonic,
          linked?.passphrase ?? this.#codex32Passphrase.value,
        );
      }
      this.#synchronizeIdentifier();
      if (!this.#codex32Identifier.checkValidity()) {
        this.#codex32Identifier.reportValidity();
        this.#codex32Identifier.focus();
        this.#codex32CreateResult.textContent = this.#codex32Identifier.validationMessage;
        return;
      }
      const threshold = this.#codex32Unsplit.checked
        ? 0
        : integer(this.#codex32Threshold, "Codex32 threshold", 2, 9);
      const count = this.#codex32Unsplit.checked
        ? 1
        : integer(this.#codex32Count, "Codex32 share count", threshold, 31);
      const created = createCodex32Shares(
        secretData,
        this.#codex32Identifier.value,
        threshold,
        count,
      );
      const heading = document.createElement("p");
      const contentLabel =
        this.#codex32SecretType.value === "bip39-entropy" ? "BIP39-entropy" : "BIP32-master-seed";
      heading.textContent =
        threshold === 0
          ? "One unsplit Codex32 " + contentLabel + " record created."
          : String(threshold) +
            "-of-" +
            String(count) +
            " Codex32 " +
            contentLabel +
            " shares created. Store the complete shares separately.";
      this.#codex32CreateResult.append(heading);
      renderSensitiveShares(
        this.#codex32CreateResult,
        created.shares,
        this.#context.writeClipboard,
        [],
        [],
        () => this.#context.jobs.ready,
      );
    } catch (cause) {
      this.#codex32CreateResult.textContent =
        cause instanceof Error ? cause.message : "Codex32 backup creation failed.";
    } finally {
      secretData?.fill(0);
    }
  };
  readonly #restore = () => {
    RenderedSecrets.replace(this.#codex32RestoreResult);
    let seed: Uint8Array | undefined;
    try {
      this.#context.jobs.assertReady();
      seed = recoverCodex32Shares(lines(required<HTMLTextAreaElement>("#codex32-shares").value));
      if (this.#codex32RestoreType.value === "bip39-entropy") {
        if (!BIP39_ENTROPY_BYTES.includes(seed.length)) {
          throw new Error(
            `BIP39 entropy must contain exactly ${orList(BIP39_ENTROPY_BYTES)} bytes.`,
          );
        }
        renderRecoveredMnemonic(
          this.#codex32RestoreResult,
          entropyToEnglishMnemonic(seed),
          this.#context.writeClipboard,
          this.#context.useMnemonicInDeriver,
          this.#context.mnemonicToSeed,
        );
      } else {
        renderRecoveredSeed(this.#codex32RestoreResult, seed, this.#context.writeClipboard);
      }
    } catch (cause) {
      RenderedSecrets.text(
        this.#codex32RestoreResult,
        cause instanceof Error ? cause.message : "Codex32 restoration failed.",
      );
    } finally {
      seed?.fill(0);
    }
  };
  /** Compose this feature without lending unbound native callbacks. */
  static install(this: void, context: RecoveryFeatureContext): void {
    new Codex32Feature(context);
  }
}

export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "codex32",
    panelId: "codex32-panel",
    phraseField: "#codex32-source",
    passphraseField: "#codex32-passphrase",
    linkedNote: "The BIP39 passphrase is included only in BIP32 master-seed mode.",
  },
  install: Codex32Feature.install,
};
