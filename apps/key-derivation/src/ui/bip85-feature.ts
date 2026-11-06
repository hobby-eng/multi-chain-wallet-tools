import { PasswordControl } from "./password-control.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import { entropyToEnglishMnemonic } from "@ckd/core/bip39.js";
import { hexToBytes, wipe } from "@ckd/core/crypto.js";
import type { RecoverySourceReference } from "./recovery-source-link.js";
import {
  installBip85ChildWallet,
  type Bip85ChildWalletOptions,
} from "./bip85-child-wallet-feature.js";
import { DerivationCancelledError, type DerivationWorkerClient } from "../workers/derive-client.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";
import { AutomaticDerivationScheduler } from "./automatic-derivation.js";
import { Bip85Error, Bip85Parameters, BIP85_HEX_BYTES } from "@ckd/core/bip85-parameters.js";
import { BIP39_WORD_COUNT_LIST } from "@ckd/core/bip39-parameters.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { WIF_VERSION_ERROR } from "@ckd/core/wif-version.js";

function bip85ErrorText(cause: unknown): string {
  if (cause instanceof Error && "code" in cause && cause.code === WIF_VERSION_ERROR)
    return "WIF encoding must use a one-byte network version.";
  const code = Bip85Error.codeOf(cause);
  if (code !== undefined) {
    const messages: Record<Bip85Error["code"], string> = {
      "bip85.application": "Choose a supported BIP85 application.",
      "bip85.index": `BIP85 index must be an integer from 0 to ${MAX_BIP32_INDEX}.`,
      "bip85.words": `BIP39 word count must be ${BIP39_WORD_COUNT_LIST}.`,
      "bip85.bytes": `BIP85 hexadecimal entropy length must be from ${BIP85_HEX_BYTES.minimum} to ${BIP85_HEX_BYTES.maximum} bytes.`,
      "bip85.private-key": "The BIP85 source did not derive a private key.",
      "bip85.scalar": "BIP85 derived an invalid secp256k1 private key. Use the next index.",
    };
    return messages[code];
  }
  return cause instanceof Error ? cause.message : "BIP85 derivation failed.";
}

/** Debounce delay for BIP85 field edits, in milliseconds. */
const BIP85_REFRESH_DELAY_MS = 300;

type ChildMessageSigning = NonNullable<Bip85ChildWalletOptions["messageSigning"]>;

interface Bip85FeatureOptions extends Omit<Bip85ChildWalletOptions, "mnemonic" | "messageSigning"> {
  parentMnemonic(): string;
  parentPassphrase(): string;
  isActive(): boolean;
  mnemonicMayBeComplete(): boolean;
  messageSigning?: ChildMessageSigning;
}

/** Owns one BIP85 panel and revokes child references on source edits or Clear. */
export class Bip85Feature {
  readonly #options: Bip85FeatureOptions;
  readonly #refresh: AutomaticDerivationScheduler;
  readonly #application: HTMLSelectElement | null;
  readonly #wordsField: HTMLElement | null;
  readonly #bytesField: HTMLElement | null;
  readonly #wifField: HTMLElement | null;
  readonly #deriveButton: HTMLButtonElement | null;
  readonly #openWalletButton: HTMLButtonElement | null;
  readonly #toggleSecretButton: HTMLButtonElement | null;
  readonly #togglePassphraseButton: HTMLButtonElement | null;
  readonly #recoverySourceMenu: HTMLElement | null;
  readonly #childWallet: ReturnType<typeof installBip85ChildWallet>;
  #mnemonicBytes: Uint8Array | null = null;
  #publishedIndex: number | null = null;
  #disposed = false;
  #sourceRevision = 0;
  #requestRevision = 0;
  #activeWorker: DerivationWorkerClient | null = null;
  #secretRevealed = false;
  readonly #passphraseControl: PasswordControl | undefined;
  constructor(options: Bip85FeatureOptions) {
    this.#options = options;
    this.#refresh = new AutomaticDerivationScheduler(
      options.document.defaultView ?? window,
      BIP85_REFRESH_DELAY_MS,
    );
    this.#application = this.#element<HTMLSelectElement>("#bip85-application");
    this.#wordsField = this.#element<HTMLElement>("#bip85-words-field");
    this.#bytesField = this.#element<HTMLElement>("#bip85-bytes-field");
    this.#wifField = this.#element<HTMLElement>("#bip85-wif-field");
    this.#deriveButton = this.#element<HTMLButtonElement>("#derive-bip85");
    this.#openWalletButton = this.#element<HTMLButtonElement>("#open-bip85-wallet");
    this.#toggleSecretButton = this.#element<HTMLButtonElement>("#toggle-bip85-secret");
    this.#togglePassphraseButton = this.#element<HTMLButtonElement>(
      "#toggle-bip85-child-passphrase",
    );
    this.#recoverySourceMenu = this.#element<HTMLElement>("#bip85-recovery-source-menu");
    this.#childWallet = installBip85ChildWallet({
      ...this.#options,
      mnemonic: () => this.#mnemonic,
      ...(this.#options.messageSigning === undefined
        ? {}
        : { messageSigning: this.#options.messageSigning }),
    });
    this.#bind();
    if (this.#toggleSecretButton !== null)
      RecoverySecretLifecycle.register(this.#toggleSecretButton, () =>
        this.#setSecretVisibility(false),
      );
    const passphrase = this.#element<HTMLInputElement>("#bip85-child-passphrase");
    this.#passphraseControl =
      this.#togglePassphraseButton === null || passphrase === null
        ? undefined
        : new PasswordControl(passphrase, this.#togglePassphraseButton, "BIP85 child passphrase");
    options.document.defaultView?.addEventListener("pagehide", () => this.wipe());
  }
  #element<T extends Element>(selector: string): T | null {
    return this.#options.document.querySelector<T>(selector);
  }
  /** Read a temporary string only for the caller that needs it; retained child data stays mutable. */
  get #mnemonic(): string | null {
    return this.#mnemonicBytes === null ? null : new TextDecoder().decode(this.#mnemonicBytes);
  }
  set #mnemonic(value: string | null) {
    this.#mnemonicBytes?.fill(0);
    this.#mnemonicBytes = value === null ? null : new TextEncoder().encode(value);
  }
  #bind(): void {
    this.#application?.addEventListener("change", () => {
      this.#syncControls();
      this.scheduleRefresh();
    });
    this.#toggleSecretButton?.addEventListener("click", () =>
      this.#setSecretVisibility(!this.#secretRevealed),
    );
    this.#deriveButton?.addEventListener("click", () => void this.derive());
    this.#openWalletButton?.addEventListener("click", () => {
      const button = this.#openWalletButton;
      if (this.#mnemonic === null || button === null) return;
      const showing = this.#childWallet.workspace?.hidden !== false;
      this.#childWallet.initialize();
      if (this.#childWallet.workspace !== null) this.#childWallet.workspace.hidden = !showing;
      button.textContent = showing ? "Hide derived wallet" : "Show derived wallet";
      button.setAttribute("aria-expanded", String(showing));
      if (showing && !this.#childWallet.hasResults()) this.#childWallet.scheduleRefresh();
    });
    for (const selector of [
      "#bip85-index",
      "#bip85-words",
      "#bip85-bytes",
      "#bip85-wif-encoding",
    ]) {
      const control = this.#element<HTMLInputElement | HTMLSelectElement>(selector);
      control?.addEventListener("input", this.scheduleRefresh);
      control?.addEventListener("change", this.scheduleRefresh);
    }
    this.#element<HTMLInputElement>("#bip85-child-passphrase")?.addEventListener("input", () => {
      this.#sourceRevision += 1;
      this.#childWallet.scheduleRefresh();
    });
    this.#syncControls();
  }
  #setSecretVisibility = (revealed: boolean): void => {
    this.#secretRevealed = revealed;
    this.#element<HTMLElement>("#bip85-result")?.classList.toggle("revealed", revealed);
    this.#element<HTMLTextAreaElement>("#bip85-output")?.classList.toggle("concealed", !revealed);
    if (this.#toggleSecretButton !== null) {
      this.#toggleSecretButton.textContent = revealed ? "Hide secret" : "Show secret";
      this.#toggleSecretButton.setAttribute("aria-pressed", String(revealed));
    }
  };

  #syncControls = (): void => {
    const selected = this.#application?.value;
    if (this.#wordsField !== null) this.#wordsField.hidden = selected !== "bip39";
    if (this.#bytesField !== null) this.#bytesField.hidden = selected !== "hex";
    if (this.#wifField !== null) this.#wifField.hidden = selected !== "wif";
  };

  #clearDerivedWallet = (): void => {
    this.#sourceRevision += 1;
    this.#mnemonic = null;
    this.#publishedIndex = null;
    if (this.#recoverySourceMenu !== null) this.#recoverySourceMenu.hidden = true;
    try {
      this.#childWallet.clear();
    } finally {
      if (this.#childWallet.workspace !== null) this.#childWallet.workspace.hidden = true;
      if (this.#openWalletButton !== null) {
        this.#openWalletButton.hidden = true;
        this.#openWalletButton.textContent = "Show derived wallet";
        this.#openWalletButton.setAttribute("aria-expanded", "false");
      }
    }
  };

  /** Stops the running request: its worker goes away and whatever it still returns is ignored. */
  #cancelDerivation = (message: string): void => {
    this.#requestRevision += 1;
    const worker = this.#activeWorker;
    this.#activeWorker = null;
    try {
      worker?.terminate(new DerivationCancelledError(message));
    } finally {
      if (this.#deriveButton !== null) this.#deriveButton.disabled = !this.#options.cryptoReady();
    }
  };

  /** Drops the running request and every child value derived so far; old references read null. */
  #discardChild = (message: string): void => {
    using _fields = {
      [Symbol.dispose]: () => {
        const output = this.#element<HTMLTextAreaElement>("#bip85-output");
        if (output !== null) output.value = "";
        const result = this.#element<HTMLElement>("#bip85-result");
        if (result !== null) result.hidden = true;
        const error = this.#element<HTMLElement>("#bip85-error");
        if (error !== null) error.hidden = true;
      },
    };
    using _child = { [Symbol.dispose]: this.#clearDerivedWallet };
    this.#refresh.cancel();
    try {
      this.#cancelDerivation(message);
    } finally {
      this.#childWallet.cancelScheduledRefresh();
    }
  };

  /** Derive the selected child through the worker, dropping every stale reply and wiping its seed. */
  derive = async (): Promise<void> => {
    if (this.#disposed) return;
    // A manual start consumes the queued edit too, before it can replace a displayed child.
    this.#refresh.cancel();
    const index = this.#element<HTMLInputElement>("#bip85-index");
    const words = this.#element<HTMLSelectElement>("#bip85-words");
    const bytes = this.#element<HTMLInputElement>("#bip85-bytes");
    const output = this.#element<HTMLTextAreaElement>("#bip85-output");
    const path = this.#element<HTMLElement>("#bip85-path");
    const result = this.#element<HTMLElement>("#bip85-result");
    const error = this.#element<HTMLElement>("#bip85-error");
    if (
      this.#application === null ||
      this.#deriveButton === null ||
      index === null ||
      words === null ||
      bytes === null ||
      output === null ||
      path === null ||
      result === null ||
      error === null
    )
      return;
    this.#cancelDerivation("Superseded by a new BIP85 request.");
    const revision = this.#requestRevision;
    result.hidden = true;
    error.hidden = true;
    if (!this.#options.cryptoReady()) {
      error.textContent = SELF_TEST_NOT_PASSED;
      error.hidden = false;
      return;
    }
    this.#deriveButton.disabled = true;
    let seed: Uint8Array | null = null;
    let worker: DerivationWorkerClient | null = null;
    try {
      const wifVersion = this.#element<HTMLSelectElement>("#bip85-wif-encoding")?.value;
      const request = Bip85Parameters.fromFields({
        application: this.#application.value,
        index: index.value,
        words: words.value,
        bytes: bytes.value,
        ...(wifVersion === undefined ? {} : { wifVersion }),
      });
      seed = this.#options.mnemonicToSeed(
        this.#options.parentMnemonic(),
        this.#options.parentPassphrase(),
      );
      worker = this.#options.createWorker();
      this.#activeWorker = worker;
      const derived = await worker.deriveBip85(seed, request.options);
      // Clear, a parent edit or a newer request ran while the worker was busy: this reply is stale.
      if (revision !== this.#requestRevision) return;
      path.textContent = derived.path;
      let displayedValue = derived.value;
      if (derived.kind === "bip39") {
        const entropy = hexToBytes(derived.value);
        try {
          displayedValue = entropyToEnglishMnemonic(entropy);
        } finally {
          wipe(entropy);
        }
      }
      output.value = displayedValue;
      this.#setSecretVisibility(this.#options.secretsRevealed() || this.#secretRevealed);
      this.#sourceRevision += 1;
      this.#mnemonic = derived.kind === "bip39" ? displayedValue : null;
      this.#publishedIndex = derived.kind === "bip39" ? request.options.index : null;
      if (this.#openWalletButton !== null) this.#openWalletButton.hidden = this.#mnemonic === null;
      if (this.#recoverySourceMenu !== null)
        this.#recoverySourceMenu.hidden = this.#mnemonic === null;
      if (this.#mnemonic === null) this.#clearDerivedWallet();
      else if (this.#childWallet.workspace?.hidden === false) await this.#childWallet.derive();
      if (revision !== this.#requestRevision) return;
      result.hidden = false;
    } catch (cause) {
      // Also drops the DerivationCancelledError that cancelDerivation() raises.
      if (revision !== this.#requestRevision) return;
      this.#clearDerivedWallet();
      error.textContent = bip85ErrorText(cause);
      error.hidden = false;
    } finally {
      seed?.fill(0);
      if (this.#activeWorker === worker) this.#activeWorker = null;
      try {
        worker?.terminate(new DerivationCancelledError("BIP85 worker released."));
      } finally {
        if (revision === this.#requestRevision)
          this.#deriveButton.disabled = !this.#options.cryptoReady();
      }
    }
  };

  /** Debounce edits and recheck feature activity and startup checks before doing work. */
  scheduleRefresh = (): void => {
    if (this.#disposed) return;
    this.#discardChild("The BIP85 parameters changed.");
    this.#refresh.schedule(
      () =>
        this.#deriveButton !== null &&
        this.#options.isActive() &&
        this.#options.mnemonicMayBeComplete() &&
        this.#options.cryptoReady(),
      () => {
        void this.derive();
      },
    );
  };

  /** Temporary child source for the active signing/derivation operation, without retaining a string copy. */
  childSource = () => ({
    adapter: this.#childWallet.adapter(),
    controls: this.#childWallet.controls(),
    mnemonic: this.#mnemonic,
    passphrase: this.#element<HTMLInputElement>("#bip85-child-passphrase")?.value ?? "",
  });

  /** Revocable reference to the current child; source edits or wiping make prior references empty. */
  sourceReference = (): RecoverySourceReference | null => {
    if (this.#mnemonic === null) return null;
    const revision = this.#sourceRevision;
    const index = this.#publishedIndex;
    return {
      label: `BIP85 child phrase${index === null ? "" : ` · index ${index}`}`,
      read: () =>
        revision === this.#sourceRevision && this.#mnemonic !== null
          ? {
              mnemonic: this.#mnemonic,
              passphrase: this.#element<HTMLInputElement>("#bip85-child-passphrase")?.value ?? "",
            }
          : null,
    };
  };

  /** Synchronize concealment of the child output, passphrase and child-wallet results. */
  setSecretsVisible = (revealed: boolean): void => {
    this.#setSecretVisibility(revealed);
    this.#passphraseControl?.setVisible(revealed);
    this.#childWallet.setSecretsVisible(revealed);
  };

  /**
   * The parent phrase or passphrase changed: the running request and every child derived from
   * the old parent are dropped. The child passphrase is the user's own input and stays.
   */
  invalidate = (): void => {
    this.#discardChild("The BIP85 parent changed.");
  };

  /** Follows the self-tests' verdict: a failure drops every child and closes the button. */
  setEnabled = (enabled: boolean): void => {
    try {
      if (!enabled) this.#discardChild("The cryptographic self-test failed.");
    } finally {
      if (!enabled) this.setSecretsVisible(false);
      if (this.#deriveButton !== null) this.#deriveButton.disabled = !enabled;
    }
  };

  /** Revoke pending work and release the child and its page fields when the owner clears them. */
  reset = (): void => {
    try {
      this.#discardChild("BIP85 derivation cleared by the user.");
    } finally {
      try {
        this.#childWallet.resetFeatures();
      } finally {
        const passphrase = this.#element<HTMLInputElement>("#bip85-child-passphrase");
        if (passphrase !== null) passphrase.value = "";
        this.#passphraseControl?.setVisible(false);
        this.#setSecretVisibility(false);
      }
    }
  };
  /** Clear the current child, its pending operations and the page's secret fields. */
  wipe(): void {
    this.reset();
  }
  /** Release the current child when the host closes this panel's lifetime. */
  [Symbol.dispose](): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.wipe();
  }
}

/** Composition callback for optional builds; all panel state belongs to Bip85Feature. */
export function installBip85Feature(options: Bip85FeatureOptions): Bip85Feature {
  return new Bip85Feature(options);
}
