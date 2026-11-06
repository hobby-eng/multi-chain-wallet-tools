/** Registration after disposal would silently ignore an action, so it is an explicit refusal. */
export class UiEventScopeError extends Error {
  readonly code = "ui.events.released";
  constructor() {
    super("The interface event scope has been released.");
    this.name = "UiEventScopeError";
  }
}

/** Owns native listener lifetime and delegates event failures to the host's safe diagnostics. */
export class UiEventScope implements Disposable {
  readonly #controller = new AbortController();
  readonly #onError: (cause: unknown) => void;

  constructor(onError: (cause: unknown) => void) {
    this.#onError = onError;
  }

  /** Registers one action until disposal; raw failures are handed only to the supplied owner. */
  listen(target: EventTarget, type: string, action: () => void): void {
    if (this.#controller.signal.aborted) throw new UiEventScopeError();
    target.addEventListener(
      type,
      () => {
        try {
          action();
        } catch (cause) {
          this.#onError(cause);
        }
      },
      { signal: this.#controller.signal },
    );
  }

  /** Removes all native listeners owned by this scope; repeated disposal is harmless. */
  dispose(): void {
    this.#controller.abort();
  }

  /** Releases listeners at the end of an explicit resource scope. */
  [Symbol.dispose](): void {
    this.dispose();
  }
}
