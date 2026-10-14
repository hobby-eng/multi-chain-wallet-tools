// The page side of MnemoCode's workers: one worker per job, made from an embedded script and
// terminated when the job ends or is cancelled, which also frees what it kept. Each worker answers
// a request with progress reports and one result.
import type { SearchProgress } from "@ckd/recovery-backup/mnemocode-search.js";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { EmbeddedWorkerResource } from "@ckd/ui/embedded-worker-resource.js";

/** The text a stopped job reports, as MHFE's Cancel says it. */
export const JOB_STOPPED = "Stopped. The worker and its memory were discarded.";

type WorkerReply<T> =
  | { type: "ready" }
  | { type: "progress"; progress: SearchProgress }
  | { type: "result"; outcome: T }
  | { type: "error"; message: string };

export class MnemoCodeWorker<Request, Outcome> {
  readonly #resource: EmbeddedWorkerResource;
  #pending: { resolve: (outcome: Outcome) => void; reject: (cause: Error) => void } | undefined;
  #onProgress: ((progress: SearchProgress) => void) | undefined;
  #ended = false;
  #started = false;

  /**
   * `source` is the text of the worker script, embedded by the build. The page's BIP39 English
   * wordlist goes before it: the worker bundles read it from there (page-wordlist.ts).
   */
  constructor(source: string) {
    const prelude = `self.ckdPageBip39English=${JSON.stringify(wordlist)};\n`;
    this.#resource = new EmbeddedWorkerResource([prelude, source], {}, () =>
      this.#fail(new Error("The MnemoCode worker did not become ready in time.")),
    );
    this.#resource.worker.onmessage = ({ data }: MessageEvent<WorkerReply<Outcome>>) => {
      if (this.#ended) return;
      if (data.type === "ready") {
        this.#resource.loaded();
        return;
      }
      if (data.type === "progress") {
        this.#onProgress?.(data.progress);
        return;
      }
      const pending = this.#pending;
      this.#pending = undefined;
      // One worker owns one job; release it before publishing its terminal outcome.
      this.terminate();
      if (data.type === "error") pending?.reject(new Error(data.message));
      else pending?.resolve(data.outcome);
    };
    this.#resource.worker.onerror = (event) => {
      event.preventDefault();
      this.#fail(new Error("The MnemoCode worker stopped unexpectedly."));
    };
  }

  /** Runs one job; progress arrives a few times a second. */
  run(request: Request, onProgress: (progress: SearchProgress) => void): Promise<Outcome> {
    if (this.#ended) return Promise.reject(new Error(JOB_STOPPED));
    if (this.#started)
      return Promise.reject(new Error("The MnemoCode worker has already started a job."));
    this.#started = true;
    this.#onProgress = onProgress;
    return new Promise((resolve, reject) => {
      this.#pending = { resolve, reject };
      try {
        this.#resource.worker.postMessage(request);
      } catch (cause) {
        this.#fail(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }

  /** Stops the worker at once; whatever it kept is gone with it. */
  terminate(): void {
    if (this.#ended) return;
    this.#ended = true;
    const pending = this.#pending;
    this.#pending = undefined;
    this.#onProgress = undefined;
    this.#resource.dispose();
    pending?.reject(new Error(JOB_STOPPED));
  }

  #fail(cause: Error): void {
    const pending = this.#pending;
    this.#pending = undefined;
    this.terminate();
    pending?.reject(cause);
  }
}
