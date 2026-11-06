import { RenderedSecrets } from "./secrets.js";
import { englishMnemonicToEntropy, entropyToEnglishMnemonic } from "@ckd/core/bip39.js";
import { describeUnknownError, freeThrownValue } from "@ckd/core/error-handling.js";
import {
  createProtectedGordianSeedEnvelope,
  deriveGordianRecipientKeys,
  recoverProtectedGordianSeedEnvelopeBundle,
} from "@ckd/recovery-backup/gordian-envelope.js";
import {
  installSecretToggle,
  installMnemonicSourceDiagnostic,
  lines,
  installThresholdGroupEditor,
  renderRecoveredMnemonicBundle,
  renderSensitiveShares,
  required,
  type RecoveryFeatureContext,
  installFieldImports,
  QR_IMAGES_IMPORT,
} from "./recovery-workspace-shared.js";
import { PHRASE_ONLY_NOTE, type RecoveryFeature } from "./recovery-feature.js";
function displayFailure(cause: unknown, fallback: string): string {
  const message = describeUnknownError(cause, fallback);
  freeThrownValue(cause);
  return message;
}

/** Owns the native controls and independent create, recipient and restore operations. */
export class GordianEnvelopeFeature {
  readonly #context: RecoveryFeatureContext;
  readonly #recipientSource: HTMLSelectElement;
  readonly #includePassphrase: HTMLInputElement;
  readonly #groupEditor: ReturnType<typeof installThresholdGroupEditor>;
  readonly #result: HTMLElement;
  readonly #restored: HTMLElement;
  /** Bind controls; every secret operation admits the current readiness gate. */
  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#recipientSource = required<HTMLSelectElement>("#envelope-recipient-source");
    this.#includePassphrase = required<HTMLInputElement>("#envelope-include-passphrase");
    this.#groupEditor = installThresholdGroupEditor("#envelope-sskr-groups", {
      initial: [],
      minimumRows: 0,
      layout: "inline",
      help: "Each permit group creates a separate set of SSKR shares. First satisfy Shares required inside a group; then satisfy the Envelope group threshold with that many completed groups.",
    });
    this.#result = required<HTMLElement>("#envelope-create-result");
    this.#restored = required<HTMLElement>("#envelope-restore-result");
    this.#installControls();
  }
  #installControls(): void {
    installSecretToggle(
      "#toggle-envelope-recipient-mnemonic",
      "#envelope-recipient-mnemonic",
      "Show",
      "Hide",
      "recipient recovery phrase",
    );
    this.#recipientSource.addEventListener("change", this.#synchronizeRecipientSource);
    this.#synchronizeRecipientSource();
    this.#includePassphrase.addEventListener("change", this.#synchronizeIncludedPassphrase);
    this.#synchronizeIncludedPassphrase();
    installSecretToggle(
      "#toggle-envelope-source",
      "#envelope-source",
      "Show",
      "Hide",
      "recovery phrase",
    );
    installMnemonicSourceDiagnostic(
      this.#context,
      "gordian-envelope",
      "#envelope-source",
      "#toggle-envelope-source",
      "#envelope-bip39-passphrase",
    );
    installSecretToggle(
      "#toggle-envelope-records",
      "#envelope-records, #envelope-private-key",
      "Show",
      "Hide",
      "records and private key",
    );
    installSecretToggle(
      "#toggle-envelope-created",
      "#envelope-create-result .share-secret",
      "Show records",
      "Hide records",
    );
    required<HTMLButtonElement>("#create-envelope").addEventListener("click", this.#create);
    required<HTMLButtonElement>("#derive-envelope-recipient").addEventListener(
      "click",
      this.#deriveRecipient,
    );
    required<HTMLButtonElement>("#restore-envelope").addEventListener("click", this.#restore);
    installFieldImports(
      required<HTMLTextAreaElement>("#envelope-records"),
      (message) => RenderedSecrets.text(this.#restored, message),
      { qr: QR_IMAGES_IMPORT },
    );
  }
  readonly #synchronizeRecipientSource = (): void => {
    const manual = this.#recipientSource.value === "manual";
    required<HTMLElement>("#envelope-current-recipient-source").hidden = manual;
    required<HTMLElement>("#envelope-manual-recipient-source").hidden = !manual;
  };
  readonly #synchronizeIncludedPassphrase = (): void => {
    required<HTMLElement>("#envelope-included-passphrase-field").hidden =
      !this.#includePassphrase.checked;
  };
  readonly #create = () => {
    RenderedSecrets.replace(this.#result);
    let entropy: Uint8Array | null = null;
    try {
      this.#context.jobs.assertReady();
      entropy = englishMnemonicToEntropy(
        this.#context.readMnemonic("gordian-envelope", "#envelope-source"),
      );
      const specs = this.#groupEditor.read();
      const records = createProtectedGordianSeedEnvelope(
        entropy,
        required<HTMLInputElement>("#envelope-name").value,
        required<HTMLInputElement>("#envelope-note").value,
        {
          password: required<HTMLInputElement>("#envelope-password").value,
          bip39Passphrase: this.#includePassphrase.checked
            ? (this.#context.linkedValue("gordian-envelope")?.passphrase ??
              required<HTMLInputElement>("#envelope-included-passphrase").value)
            : undefined,
          recipientPublicKeys: lines(required<HTMLTextAreaElement>("#envelope-public-keys").value),
          sskrGroupThreshold: specs.length
            ? Number(required<HTMLInputElement>("#envelope-group-threshold").value)
            : undefined,
          sskrGroups: specs,
        },
      );
      renderSensitiveShares(
        this.#result,
        records,
        this.#context.writeClipboard,
        records.length === 1
          ? ["Seed Envelope record"]
          : records.map((_, index) => `SSKR Envelope record ${index + 1}`),
        [],
        () => this.#context.jobs.ready,
      );
    } catch (e) {
      RenderedSecrets.text(this.#result, displayFailure(e, "Envelope creation failed."));
    } finally {
      entropy?.fill(0);
    }
  };
  readonly #deriveRecipient = () => {
    RenderedSecrets.replace(this.#result);
    let seed: Uint8Array | null = null;
    try {
      this.#context.jobs.assertReady();
      const linked = this.#context.linkedValue("gordian-envelope");
      const manual = this.#recipientSource.value === "manual";
      const mnemonic = manual
        ? required<HTMLTextAreaElement>("#envelope-recipient-mnemonic").value
        : (linked?.mnemonic ?? required<HTMLTextAreaElement>("#envelope-source").value);
      const passphrase = manual
        ? required<HTMLInputElement>("#envelope-recipient-manual-passphrase").value
        : (linked?.passphrase ?? required<HTMLInputElement>("#envelope-bip39-passphrase").value);
      seed = this.#context.mnemonicToSeed(mnemonic, passphrase);
      const keys = deriveGordianRecipientKeys(seed);
      const recipients = required<HTMLTextAreaElement>("#envelope-public-keys");
      const existing = lines(recipients.value);
      if (!existing.includes(keys.publicKey))
        recipients.value = [...existing, keys.publicKey].join("\n");
      renderSensitiveShares(
        this.#result,
        [keys.privateKey, keys.publicKey],
        this.#context.writeClipboard,
        ["Recipient private key", "Recipient public key"],
        [],
        () => this.#context.jobs.ready,
      );
    } catch (e) {
      RenderedSecrets.text(this.#result, displayFailure(e, "Recipient derivation failed."));
    } finally {
      seed?.fill(0);
    }
  };
  readonly #restore = () => {
    RenderedSecrets.replace(this.#restored);
    let entropy: Uint8Array | null = null;
    try {
      this.#context.jobs.assertReady();
      const bundle = recoverProtectedGordianSeedEnvelopeBundle(
        lines(required<HTMLTextAreaElement>("#envelope-records").value),
        required<HTMLInputElement>("#envelope-unlock-password").value,
        required<HTMLTextAreaElement>("#envelope-private-key").value.trim(),
      );
      entropy = bundle.entropy;
      renderRecoveredMnemonicBundle(
        this.#restored,
        entropyToEnglishMnemonic(entropy),
        bundle.bip39Passphrase,
        this.#context.writeClipboard,
        this.#context.useMnemonicInDeriver,
        this.#context.mnemonicToSeed,
      );
    } catch (e) {
      RenderedSecrets.text(this.#restored, displayFailure(e, "Envelope restoration failed."));
    } finally {
      entropy?.fill(0);
    }
  };
  /** Compose this feature without lending unbound native callbacks. */
  static install(this: void, context: RecoveryFeatureContext): void {
    new GordianEnvelopeFeature(context);
  }
}

export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "gordian-envelope",
    panelId: "gordian-envelope-panel",
    phraseField: "#envelope-source",
    passphraseField: "#envelope-bip39-passphrase",
    linkedNote: PHRASE_ONLY_NOTE,
  },
  install: GordianEnvelopeFeature.install,
};
