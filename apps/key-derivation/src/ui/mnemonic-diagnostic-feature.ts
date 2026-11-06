import { diagnoseMnemonic } from "@ckd/core/bip39.js";
import { MnemonicFingerprint } from "@ckd/core/mnemonic-fingerprint.js";
import type { KeyDerivationView } from "./view.js";
import { ENGLISH_BIP39_WORDS } from "@ckd/core/bip39-word-reader.js";
import { isBip39WordCount } from "@ckd/core/bip39-parameters.js";
import { Bip39InputText } from "./bip39-input-text.js";
import { Bip39InputError } from "@ckd/core/bip39-input.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";

interface MnemonicDiagnosticOptions {
  view: Pick<KeyDerivationView, "updateWordCount" | "updateSeedDiagnostic">;
  mnemonic: HTMLTextAreaElement;
  passphrase: HTMLInputElement;
  sourceRevealed(): boolean;
  cryptoReady(): boolean;
  mnemonicToSeed: typeof import("@ckd/core/bip39.js").mnemonicToSeed;
}

/** Reads current native factors for diagnostics; every temporary fingerprint seed is wiped. */
export class MnemonicDiagnosticFeature {
  readonly #options: MnemonicDiagnosticOptions;
  #revision = 0;

  /** Bind diagnostic presentation and the host's existing seed conversion without retaining factors. */
  constructor(options: MnemonicDiagnosticOptions) {
    this.#options = options;
  }

  /** Render a current diagnostic and fingerprint without retaining a phrase or a seed. */
  readonly update = (): void => {
    const revision = ++this.#revision;
    const options = this.#options;
    if (!options.cryptoReady()) {
      options.view.updateSeedDiagnostic({ unavailable: SELF_TEST_NOT_PASSED }, null, false);
      return;
    }
    try {
      this.#update(revision);
    } catch (cause) {
      if (revision !== this.#revision) return;
      const message = Bip39InputText.of(cause);
      if (message === undefined) throw cause;
      options.view.updateWordCount(options.sourceRevealed());
      options.view.updateSeedDiagnostic({ unavailable: message }, null, false);
    }
  };

  #update(revision: number): void {
    const options = this.#options;
    const revealed = options.sourceRevealed();
    using diagnostic = diagnoseMnemonic(options.mnemonic.value);
    let fingerprint: string | null = null;
    if (
      diagnostic.checksumValid &&
      revealed &&
      options.cryptoReady() &&
      revision === this.#revision
    ) {
      const passphrase = options.passphrase.value;
      if (options.cryptoReady() && options.sourceRevealed() && revision === this.#revision)
        fingerprint = MnemonicFingerprint.fromPhrase(
          diagnostic.normalized,
          passphrase,
          options.mnemonicToSeed,
        );
    }
    if (revision !== this.#revision) return;
    if (!options.cryptoReady()) {
      options.view.updateSeedDiagnostic({ unavailable: SELF_TEST_NOT_PASSED }, null, false);
      return;
    }
    const stillRevealed = options.sourceRevealed();
    options.view.updateWordCount(stillRevealed);
    options.view.updateSeedDiagnostic(diagnostic, fingerprint, stillRevealed);
  }
  /** Cheap lexical readiness only; the library still validates every word and checksum. */
  readonly mayBeComplete = (): boolean => {
    try {
      return isBip39WordCount(ENGLISH_BIP39_WORDS.wordCount(this.#options.mnemonic.value));
    } catch (cause) {
      if (cause instanceof Bip39InputError) return false;
      throw cause;
    }
  };

  /** Re-read cleared native fields through the same diagnostic path. */
  readonly reset = this.update;

  /** Compatibility installer; the returned operations keep their original receivers. */
  static install(options: MnemonicDiagnosticOptions): MnemonicDiagnosticFeature {
    return new MnemonicDiagnosticFeature(options);
  }
}

/** Compatibility entry for the shared Deriver installer. */
export const installMnemonicDiagnosticFeature =
  MnemonicDiagnosticFeature.install.bind(MnemonicDiagnosticFeature);
