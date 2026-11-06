/** Native edges and the current disclosure permission for one group of clipboard actions. */
export interface ClipboardActionDependencies {
  secretsRevealed(): boolean;
  writeClipboard(text: string, signal?: AbortSignal): Promise<void>;
  flashCopied(button: HTMLButtonElement): void;
  showError(message: string): void;
  showStatus(message: string): void;
}

/** A native text view, or a field source evaluated only after disclosure admission. */
export type ClipboardText = string | (() => string);

/** Owns cancellable native writes and safe completion messages, without retaining their text. */
export class ClipboardAction {
  readonly #dependencies: ClipboardActionDependencies;
  readonly #writes = new Set<AbortController>();
  #revision = 0;

  constructor(dependencies: ClipboardActionDependencies) {
    this.#dependencies = dependencies;
  }

  /** Revoke future fallback writes and completion messages; an OS copy already delivered cannot be recalled. */
  invalidate(): void {
    this.#revision += 1;
    for (const write of this.#writes) write.abort();
    this.#writes.clear();
  }

  /** Admission before a caller assembles private text; copy() rechecks before the native handoff. */
  allows(containsSecret: boolean): boolean {
    if (this.#disclosed(containsSecret)) return true;
    this.#dependencies.showError("Show private and privacy-sensitive values before copying them.");
    return false;
  }

  /** Send a temporary text view to the native edge; supplied error text never enters diagnostics. */
  readonly copy = (
    button: HTMLButtonElement,
    text: ClipboardText,
    containsSecret: boolean,
  ): Promise<void> => {
    if (!this.allows(containsSecret)) return Promise.resolve();
    const revision = this.#revision;
    const write = new AbortController();
    this.#writes.add(write);
    let pending: Promise<void>;
    try {
      const value = typeof text === "function" ? text() : text;
      if (revision !== this.#revision || !this.#disclosed(containsSecret)) {
        this.#writes.delete(write);
        return Promise.resolve();
      }
      pending = this.#dependencies.writeClipboard(value, write.signal);
    } catch {
      this.#writes.delete(write);
      this.#dependencies.showError("Clipboard access failed.");
      return Promise.resolve();
    } finally {
      // The native browser owns any immutable input copy; JavaScript cannot erase it.
      text = "";
    }
    return pending
      .then(() => {
        if (revision !== this.#revision || !this.#disclosed(containsSecret)) return;
        this.#dependencies.flashCopied(button);
        this.#dependencies.showStatus(
          containsSecret
            ? "Sensitive values copied. Clear your clipboard when finished."
            : "Copied to clipboard.",
        );
      })
      .catch(() => {
        if (revision === this.#revision) this.#dependencies.showError("Clipboard access failed.");
      })
      .finally(() => {
        this.#writes.delete(write);
      });
  };

  #disclosed(containsSecret: boolean): boolean {
    return !containsSecret || this.#dependencies.secretsRevealed();
  }
}
