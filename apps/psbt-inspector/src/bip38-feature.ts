import { UiEventScope } from "@ckd/ui/ui-event-scope.js";
import { Bip38Batch } from "./bip38-batch.js";
import { Bip38Input } from "./bip38-input.js";
import { Bip38Results } from "./bip38-results.js";
import { required, syncNetworkChoice } from "./ui-common.js";

/** Translates the page's fields into owned requests and publishes only current completions. */
export class Bip38Feature implements Disposable {
  readonly #ui = {
    chain: required<HTMLSelectElement>("bip38-chain"),
    network: required<HTMLSelectElement>("bip38-network"),
    encryptedKey: required<HTMLTextAreaElement>("bip38-encrypted-key"),
    password: required<HTMLInputElement>("bip38-password"),
    togglePassword: required<HTMLButtonElement>("toggle-bip38-password"),
    decrypt: required<HTMLButtonElement>("decrypt-bip38"),
    clear: required<HTMLButtonElement>("clear-bip38"),
    error: required<HTMLElement>("bip38-error"),
    progress: required<HTMLElement>("bip38-progress"),
    results: required<HTMLElement>("bip38-results"),
    list: required<HTMLElement>("bip38-result-list"),
    toggleResult: required<HTMLButtonElement>("toggle-bip38-result"),
  };
  readonly #events = new UiEventScope((cause) => this.#failure(cause));
  readonly #results = new Bip38Results(this.#ui.list, this.#ui.toggleResult, (cause) =>
    this.#failure(cause),
  );
  #revision = 0;
  #batch: Bip38Batch | undefined;
  #running = false;
  #queued: { readonly batch: Bip38Batch; readonly revision: number } | undefined;
  #disposed = false;
  #completion = Promise.resolve();

  constructor() {
    try {
      this.#bind();
      syncNetworkChoice(this.#ui.chain, this.#ui.network);
    } catch (cause) {
      this.dispose();
      throw cause;
    }
  }

  #bind(): void {
    this.#events.listen(this.#ui.decrypt, "click", () => this.#start());
    this.#events.listen(this.#ui.clear, "click", () => this.#clear());
    this.#events.listen(this.#ui.toggleResult, "click", () => this.#results.toggle());
    this.#events.listen(this.#ui.togglePassword, "click", () =>
      this.#passwordVisibility(this.#ui.password.type === "password"),
    );
    for (const field of [
      this.#ui.encryptedKey,
      this.#ui.password,
      this.#ui.network,
      this.#ui.chain,
    ])
      for (const type of ["input", "change"])
        this.#events.listen(field, type, () => this.#retire());
    this.#events.listen(this.#ui.chain, "change", () =>
      syncNetworkChoice(this.#ui.chain, this.#ui.network),
    );
    this.#events.listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") this.#conceal();
    });
    this.#events.listen(window, "blur", () => this.#conceal());
    this.#events.listen(window, "pagehide", () => this.dispose());
  }

  #passwordVisibility(show: boolean): void {
    this.#ui.password.type = show ? "text" : "password";
    this.#ui.togglePassword.textContent = show ? "Hide" : "Show";
    this.#ui.togglePassword.setAttribute("aria-pressed", String(show));
  }
  #conceal(): void {
    this.#passwordVisibility(false);
    this.#results.conceal();
  }
  #failure(cause: unknown): void {
    if (this.#disposed) return;
    this.#ui.error.textContent = Bip38Input.message(cause);
    this.#ui.error.hidden = false;
  }

  #retire(): void {
    this.#revision += 1;
    this.#queued?.batch.wipe();
    this.#queued = undefined;
    this.#batch?.wipe();
    this.#batch = undefined;
    this.#results.clear();
    this.#ui.results.hidden = true;
    this.#ui.error.hidden = true;
    this.#ui.progress.hidden = true;
    this.#conceal();
  }

  #clear(): void {
    this.#retire();
    this.#ui.encryptedKey.value = "";
    this.#ui.password.value = "";
    // A new explicit click can queue one request; it cannot start a second KDF concurrently.
    this.#ui.decrypt.disabled = false;
    this.#ui.decrypt.textContent = "Decrypt keys";
  }

  #start(): void {
    if (this.#disposed) return;
    this.#retire();
    let batch: Bip38Batch | undefined;
    try {
      batch = new Bip38Batch(
        this.#ui.encryptedKey.value,
        this.#ui.password.value,
        this.#ui.chain.value,
        this.#ui.network.value,
      );
      const revision = this.#revision;
      if (this.#running) {
        this.#queued = { batch, revision };
        this.#ui.decrypt.disabled = true;
        this.#ui.decrypt.textContent = "Waiting for the preceding key…";
        return;
      }
      this.#launch(batch, revision);
    } catch (cause) {
      if (this.#queued?.batch === batch) this.#queued = undefined;
      batch?.wipe();
      this.#failure(cause);
    }
  }

  #launch(batch: Bip38Batch, revision: number): void {
    try {
      this.#ui.decrypt.disabled = true;
      this.#ui.decrypt.textContent = "Decrypting…";
      this.#ui.results.hidden = false;
      this.#batch = batch;
      this.#running = true;
      this.#completion = this.#run(batch, revision).catch((cause) => {
        if (!this.#disposed && revision === this.#revision) this.#failure(cause);
      });
    } catch (cause) {
      batch.wipe();
      this.#batch = undefined;
      this.#running = false;
      this.#failure(cause);
    }
  }

  #current(batch: Bip38Batch, revision: number): boolean {
    if (this.#disposed || this.#batch !== batch || this.#revision !== revision) return false;
    if (
      batch.matches(
        this.#ui.encryptedKey.value,
        this.#ui.password.value,
        this.#ui.chain.value,
        this.#ui.network.value,
      )
    )
      return true;
    this.#retire();
    return false;
  }

  async #run(batch: Bip38Batch, revision: number): Promise<void> {
    let succeeded = 0;
    let failed = 0;
    try {
      for (let index = 0; index < batch.count; index += 1) {
        if (!this.#current(batch, revision)) return;
        this.#ui.progress.textContent = `Decrypting ${index + 1} of ${batch.count}…`;
        this.#ui.progress.hidden = false;
        try {
          const recovered = await batch.decrypt(index);
          if (!this.#current(batch, revision)) return;
          this.#results.success(index + 1, recovered);
          succeeded += 1;
        } catch (cause) {
          if (!this.#current(batch, revision)) return;
          this.#results.failure(index + 1, cause);
          failed += 1;
        }
      }
      if (!this.#current(batch, revision)) return;
      this.#ui.password.value = "";
      this.#passwordVisibility(false);
      this.#ui.progress.textContent = `Finished ${batch.count} keys · ${succeeded} recovered${failed === 0 ? "" : ` · ${failed} failed`}.`;
    } finally {
      try {
        batch.wipe();
      } finally {
        if (this.#batch === batch) this.#batch = undefined;
        this.#running = false;
        if (!this.#disposed) {
          this.#ui.decrypt.disabled = false;
          this.#ui.decrypt.textContent = "Decrypt keys";
          this.#launchQueued();
        }
      }
    }
  }

  #launchQueued(): void {
    const queued = this.#queued;
    this.#queued = undefined;
    if (queued === undefined) return;
    if (
      queued.revision === this.#revision &&
      queued.batch.matches(
        this.#ui.encryptedKey.value,
        this.#ui.password.value,
        this.#ui.chain.value,
        this.#ui.network.value,
      )
    )
      this.#launch(queued.batch, queued.revision);
    else queued.batch.wipe();
  }

  /** Revokes publication and clears typed and displayed secret fields. */
  wipe(): void {
    this.#clear();
  }
  /** Lets a host wait for queued/in-flight KDF cleanup after revoking its publication. */
  async whenIdle(): Promise<void> {
    while (this.#running) await this.#completion;
  }
  /** Ends the page's result/listener lifetime; an in-flight library KDF may still finish privately. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.wipe();
    } finally {
      try {
        this.#results.dispose();
      } finally {
        this.#events.dispose();
      }
    }
  }
  [Symbol.dispose](): void {
    this.dispose();
  }
}

/** Compatibility installer; every operation and listener belongs to the feature owner. */
export function installBip38Feature(): void {
  new Bip38Feature();
}
