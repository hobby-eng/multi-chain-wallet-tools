// The question a check asks when detection found no length (the package's onNoLength), as
// `mhfe check` asks it (src/bin/mhfe/check.rs, ask_length_after_detection): no 12- to 21-word
// length passed its built-in check, which detection tried already, so only a 24-word phrase is
// left, compared with an address or the master key fingerprint of the wallet on the same recovery.
// The check waits for the answer while its recovery is held; Cancel ends both.
import type { MhfeNoLengthAnswer } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { SearchReference } from "./recovery-mhfe-search-reference.js";
import { required } from "./recovery-workspace-shared.js";

export class NoLengthQuestion {
  readonly #block: HTMLElement;
  readonly #reference: SearchReference;
  readonly #compare: HTMLButtonElement;
  readonly #fewer: HTMLButtonElement;
  readonly #status: HTMLElement;

  /** `prefix` names the fields, as in `#mhfe-check-no-length`; `status` is the tab's line. */
  constructor(engine: MhfeEngine, prefix: string, status: HTMLElement) {
    const id = `mhfe-${prefix}-no-length`;
    this.#block = required<HTMLElement>(`#${id}`);
    this.#reference = new SearchReference(engine, id);
    this.#compare = required<HTMLButtonElement>(`#${id}-compare`);
    this.#fewer = required<HTMLButtonElement>(`#${id}-fewer`);
    this.#status = status;
    this.#block.hidden = true;
  }

  /**
   * Asks, and resolves with the wallet to compare with and the check's `passphrase`, or null when
   * the phrase has fewer words, which detection found not to pass: the check then does not match.
   */
  ask(run: MhfeRun, passphrase: string): Promise<MhfeNoLengthAnswer | null> {
    this.#reference.reset();
    this.#reference.show(false);
    this.#block.hidden = false;
    this.#status.textContent = "Detection found no length: answer below.";
    return new Promise<MhfeNoLengthAnswer | null>((resolve) => {
      const answer = (given: MhfeNoLengthAnswer | null): void => {
        this.#compare.onclick = null;
        this.#fewer.onclick = null;
        this.#block.hidden = true;
        resolve(given);
      };
      this.#compare.onclick = () => {
        try {
          answer({ ...this.#reference.reference(), passphrase });
        } catch (cause) {
          this.#status.textContent = cause instanceof Error ? cause.message : String(cause);
        }
      };
      this.#fewer.onclick = () => answer(null);
      // Cancel stops the check, which then waits for nothing.
      void run.step(() => new Promise<never>(() => undefined)).catch(() => answer(null));
    });
  }
}
