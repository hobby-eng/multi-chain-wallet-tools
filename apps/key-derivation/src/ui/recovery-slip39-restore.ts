import { RenderedSecrets } from "./secrets.js";
import { entropyToEnglishMnemonic } from "@ckd/core/bip39.js";
import {
  Slip39RestoreRequest,
  type Slip39RestoreWire,
} from "@ckd/recovery-backup/slip39-restore-request.js";
import { SLIP39_WORDLIST } from "@ckd/recovery-backup/slip39-wordlist.js";
import { RecoveryWorker, JOB_STOPPED } from "../workers/recovery-worker-client.js";
import { RecoveryWorkerProtocol } from "../workers/recovery-worker-protocol.js";
import { RecoveryWorkerWordlists } from "../workers/recovery-worker-wordlists.js";
import { InputRevision } from "./recovery-input-revision.js";
import {
  paragraph,
  renderRecoveredMnemonic,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

declare const __SLIP39_WORKER_SOURCE__: string;

/** Restore's assessment, explicit cost confirmation, cancellable worker and current result. */
export class Slip39Restore {
  readonly #context: RecoveryFeatureContext;
  readonly #result = required<HTMLElement>("#slip39-restore-result");
  readonly #button = required<HTMLButtonElement>("#restore-slip39-shares");
  readonly #cancel = required<HTMLButtonElement>("#slip39-restore-stop");
  readonly #shares = required<HTMLTextAreaElement>("#slip39-shares");
  readonly #passphrase = required<HTMLInputElement>("#slip39-restore-passphrase");
  readonly #label: string;
  readonly #inputs: InputRevision;
  #confirmedFor: (() => boolean) | undefined;
  #worker: RecoveryWorker<Slip39RestoreWire, Uint8Array> | undefined;
  #running = false;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#label = this.#button.textContent?.trim() || "Restore phrase";
    this.#inputs = new InputRevision(required("#slip39-restore-panel"), () => this.#revoke());
    this.#inputs.bindPageLifetime(() => {
      this.#shares.value = "";
      this.#passphrase.value = "";
    });
    context.jobs.onChange((change) => {
      if (change === "ready" && !context.jobs.ready) this.#inputs.revise();
      this.#synchronize();
    });
    this.#button.addEventListener("click", () => void this.#run());
    this.#cancel.addEventListener("click", () => {
      this.#inputs.revise();
      RenderedSecrets.text(this.#result, JOB_STOPPED);
    });
    this.#synchronize();
  }

  #synchronize(): void {
    this.#button.disabled =
      !this.#context.jobs.ready || this.#running || this.#context.jobs.runningJob !== null;
    this.#cancel.hidden = !this.#running;
  }

  #revoke(): void {
    this.#confirmedFor = undefined;
    this.#button.textContent = this.#label;
    this.#worker?.terminate();
    this.#worker = undefined;
    RenderedSecrets.replace(this.#result);
  }

  async #run(): Promise<void> {
    if (!this.#context.jobs.ready || this.#running || this.#context.jobs.runningJob !== null)
      return;
    const confirmed = this.#confirmedFor?.() === true;
    this.#inputs.revise();
    const inputsCurrent = this.#inputs.capture();
    const ready = this.#context.jobs.captureReadiness();
    const current = (): boolean => inputsCurrent() && ready() && this.#result.isConnected;
    try {
      using input = new Slip39RestoreRequest(this.#shares.value, this.#passphrase.value);
      const work = input.assess();
      if (!current()) return;
      if (work.requiresConfirmation && !confirmed) {
        this.#confirmedFor = current;
        this.#button.textContent = "Restore anyway";
        this.#result.append(
          paragraph(
            `These shares request more work than a default SLIP-39 backup: ${work.prfIterations.toLocaleString("en-US")} hash iterations. This can take a long time. Press Restore anyway to run it in a cancellable worker.`,
            "warning-callout",
          ),
        );
        return;
      }
      this.#running = true;
      this.#synchronize();
      RenderedSecrets.text(this.#result, "Restoring SLIP-39 shares…");
      await this.#context.jobs.runHeavy("SLIP-39 restoration", async () => {
        if (!current()) return;
        using worker = new RecoveryWorker<Slip39RestoreWire, Uint8Array>(__SLIP39_WORKER_SOURCE__, {
          label: "SLIP-39",
          errorPrefix: "wallet.slip39-worker",
          discardOutcome: RecoveryWorkerProtocol.discard,
          publicPrelude: RecoveryWorkerWordlists.prelude("slip39", SLIP39_WORDLIST),
        });
        this.#worker = worker;
        const { request, transfer } = input.take(confirmed);
        const outcome = await worker.run(request, () => undefined, transfer);
        const entropy = RecoveryWorkerProtocol.completed<Uint8Array>(outcome);
        if (entropy === undefined) {
          if (current()) RenderedSecrets.text(this.#result, JOB_STOPPED);
          return;
        }
        try {
          if (!current()) return;
          const mnemonic = entropyToEnglishMnemonic(entropy);
          RenderedSecrets.replace(this.#result);
          renderRecoveredMnemonic(
            this.#result,
            mnemonic,
            this.#context.writeClipboard,
            this.#context.useMnemonicInDeriver,
            this.#context.mnemonicToSeed,
            "",
            current,
          );
        } finally {
          entropy.fill(0);
        }
      });
    } catch (cause) {
      if (current())
        RenderedSecrets.text(
          this.#result,
          cause instanceof Error ? cause.message : "SLIP-39 restoration failed.",
        );
    } finally {
      this.#worker = undefined;
      this.#running = false;
      this.#synchronize();
    }
  }
}
