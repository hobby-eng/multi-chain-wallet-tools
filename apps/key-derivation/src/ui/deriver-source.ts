import { englishMnemonicToEntropy } from "@ckd/core/bip39.js";
import { ClipboardAction, type ClipboardActionDependencies } from "@ckd/ui/clipboard-action.js";
import type { KeyDerivationView } from "./view.js";
import type { ChosenWordsFeature } from "./chosen-words-feature.js";
import type { RecoverySourceReference } from "./recovery-source-link.js";

type SourceView = Pick<
  KeyDerivationView,
  | "mnemonic"
  | "passphrase"
  | "copyMnemonicButton"
  | "toggleSensitiveValues"
  | "setRecoverySourceVisibility"
  | "clearAllInputs"
  | "setGeneratedMnemonic"
  | "showError"
  | "showStatus"
  | "flashCopied"
>;

interface SourceOptions {
  readonly writeClipboard: ClipboardActionDependencies["writeClipboard"];
  readonly onVisibility: () => void;
  readonly chosenWords?: Pick<ChosenWordsFeature, "setRevealed">;
  readonly offer?: (reference: RecoverySourceReference | null) => void;
}

/** Owns source epochs, native field lifetime and disclosure, without retaining extra input strings. */
export class DeriverSource implements Disposable {
  readonly #view: SourceView;
  readonly #options: SourceOptions;
  readonly #clipboard: ClipboardAction;
  #revision = 0;
  #revealed = false;

  constructor(view: SourceView, options: SourceOptions) {
    this.#view = view;
    this.#options = options;
    this.#clipboard = new ClipboardAction({
      secretsRevealed: () => this.#revealed,
      writeClipboard: options.writeClipboard,
      flashCopied: (button) => view.flashCopied(button),
      showError: (message) => view.showError(message),
      showStatus: (message) => view.showStatus(message),
    });
    view.copyMnemonicButton.addEventListener("click", () => this.#copy());
    view.toggleSensitiveValues.addEventListener("click", () => this.setRevealed(!this.#revealed));
  }

  /** Whether the person currently allows the source and its chosen words to be shown. */
  get revealed(): boolean {
    return this.#revealed;
  }

  /** Concealment revokes pending copies; previously delivered OS copies cannot be recalled. */
  setRevealed(revealed: boolean): void {
    if (!revealed) this.#clipboard.invalidate();
    this.#revealed = revealed;
    this.#view.setRecoverySourceVisibility(revealed);
    this.#options.chosenWords?.setRevealed(revealed);
    this.#options.onVisibility();
  }

  #invalidate(): void {
    this.#revision += 1;
    this.#clipboard.invalidate();
  }

  /** An edit or new operation revokes prior references; only the newest queued offer is published. */
  changed(): void {
    this.#invalidate();
    const revision = this.#revision;
    queueMicrotask(() => {
      if (revision === this.#revision) this.offer();
    });
  }

  /** Revoke references and copies acquired during an awaited generation, then publish its new source. */
  publish(phrase: string, resultCount: number): void {
    this.#invalidate();
    this.#view.setGeneratedMnemonic(phrase, resultCount);
    this.offer();
  }

  /** A source reference stores an epoch, never a phrase; every read is a temporary native field view. */
  reference(): RecoverySourceReference {
    const revision = this.#revision;
    return {
      label: "Original recovery phrase",
      read: () =>
        revision === this.#revision
          ? { mnemonic: this.#view.mnemonic.value, passphrase: this.#view.passphrase.value }
          : null,
    };
  }

  /** Offer only a checksum-valid English BIP39 source; entropy inspection bytes are always wiped. */
  offer(): void {
    if (this.#options.offer === undefined) return;
    let entropy: Uint8Array | null = null;
    let reference: RecoverySourceReference | null = null;
    try {
      entropy = englishMnemonicToEntropy(this.#view.mnemonic.value);
      reference = this.reference();
    } catch {
      // Incomplete typed text has no source to offer; the phrase field owns its diagnostic.
    } finally {
      entropy?.fill(0);
    }
    this.#options.offer(reference);
  }

  #copy(): void {
    if (!this.#revealed || this.#view.mnemonic.value.trim().length === 0) {
      this.#view.showError("Show the recovery phrase before copying it.");
      return;
    }
    void this.#clipboard.copy(
      this.#view.copyMnemonicButton,
      this.#view.mnemonic.value.trim(),
      true,
    );
  }

  /** Revoke references/copies and release native input strings; runtime erasure cannot be guaranteed. */
  wipe(): void {
    this.changed();
    try {
      this.#view.clearAllInputs();
    } finally {
      this.setRevealed(false);
    }
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}
