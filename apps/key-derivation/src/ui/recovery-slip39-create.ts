import { englishMnemonicToEntropy } from "@ckd/core/bip39.js";
import { Slip39 } from "@ckd/recovery-backup/slip39.js";
import { defined } from "@ckd/core/defined.js";
import { InputRevision } from "./recovery-input-revision.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import {
  integer,
  renderSensitiveShares,
  paragraph,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

/** Creation's input and result lifetime; the library owns threshold, encoding and KDF rules. */
export class Slip39Create {
  readonly #context: RecoveryFeatureContext;
  readonly #result = required<HTMLElement>("#slip39-create-result");
  readonly #toggle = required<HTMLElement>("#toggle-slip39-created");
  readonly #inputs: InputRevision;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#inputs = new InputRevision(required("#slip39-create-panel"), () => {
      RecoverySecretLifecycle.concealControl(this.#toggle);
      this.#result.replaceChildren();
    });
    this.#inputs.bindPageLifetime(() => {
      required<HTMLTextAreaElement>("#slip39-source-mnemonic").value = "";
      required<HTMLInputElement>("#slip39-create-passphrase").value = "";
    });
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "slip39") this.#inputs.revise();
    });
    context.jobs.onChange((change) => {
      if (change === "ready" && !context.jobs.ready) this.#inputs.revise();
    });
    required<HTMLButtonElement>("#create-slip39-shares").addEventListener("click", () =>
      this.#run(),
    );
  }

  #run(): void {
    if (!this.#context.jobs.ready) return;
    this.#inputs.revise();
    const currentInputs = this.#inputs.capture();
    const ready = this.#context.jobs.captureReadiness();
    const current = (): boolean => currentInputs() && ready() && this.#result.isConnected;
    let entropy: Uint8Array | undefined;
    try {
      const parameters = Slip39.parameters();
      const threshold = integer(
        required<HTMLInputElement>("#slip39-threshold"),
        "Share threshold",
        1,
        parameters.maximumShares,
      );
      const count = integer(
        required<HTMLInputElement>("#slip39-count"),
        "Share count",
        threshold,
        parameters.maximumShares,
      );
      entropy = englishMnemonicToEntropy(
        this.#context.readMnemonic("slip39", "#slip39-source-mnemonic").trim(),
      );
      const shares = defined(
        Slip39.create(entropy, {
          groupThreshold: 1,
          groups: [{ memberThreshold: threshold, memberCount: count }],
          passphrase: required<HTMLInputElement>("#slip39-create-passphrase").value,
          extendable: required<HTMLSelectElement>("#slip39-format").value === "extendable",
          iterationExponent: parameters.defaultIterationExponent,
        })[0],
      );
      if (!current()) return;
      this.#result.append(
        paragraph(`${threshold}-of-${count} SLIP-39 shares created. Store the shares separately.`),
      );
      renderSensitiveShares(this.#result, shares, this.#context.writeClipboard, [], [], current);
    } catch (cause) {
      if (current())
        this.#result.textContent =
          cause instanceof Error ? cause.message : "SLIP-39 share creation failed.";
    } finally {
      entropy?.fill(0);
    }
  }
}
