import type { SearchProgress } from "@ckd/recovery-backup/mnemocode-search.js";
import { compiledMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { RecoveryWorker, JOB_STOPPED } from "./recovery-worker-client.js";
import { RecoveryWorkerProtocol, type WorkerStopped } from "./recovery-worker-protocol.js";
import { RecoveryWorkerWordlists } from "./recovery-worker-wordlists.js";

/** What a MnemoCode worker is given: the page's compiled MnemoCode, which it instantiates, and the job. */
export interface MnemoCodeWorkerMessage<Request> {
  readonly module: WebAssembly.Module;
  readonly request: Request;
}

/** The existing cancellation text is shared with the generic resource. */
export { JOB_STOPPED };

/** A MnemoCode job in a worker of its own, which gets the page's compiled MnemoCode with the job. */
export class MnemoCodeWorker<Request, Outcome> implements Disposable {
  readonly #worker: RecoveryWorker<MnemoCodeWorkerMessage<Request>, Outcome, SearchProgress>;

  /**
   * `source` is the text of the worker script, embedded by the build. The page's BIP39 English
   * wordlist goes before it: the worker bundles read it from there (page-wordlist.ts).
   */
  constructor(source: string) {
    this.#worker = new RecoveryWorker<MnemoCodeWorkerMessage<Request>, Outcome, SearchProgress>(
      source,
      {
        publicPrelude: RecoveryWorkerWordlists.prelude("bip39", wordlist),
        label: RecoveryWorkerProtocol.MNEMOCODE_LABEL,
        errorPrefix: "wallet.mnemocode-worker",
        discardOutcome: RecoveryWorkerProtocol.discard,
      },
    );
  }
  /** Runs the single request through the shared lifecycle. */
  run(
    request: Request,
    onProgress: (progress: SearchProgress) => void,
  ): Promise<Outcome | WorkerStopped> {
    return this.#worker.run({ module: compiledMnemoCode(), request }, onProgress);
  }
  /** Stops the shared worker and settles a cancelled request. */
  terminate(): void {
    this.#worker.terminate();
  }
  /** Ends this adapter's resource lifetime. */
  [Symbol.dispose](): void {
    this.terminate();
  }
}
