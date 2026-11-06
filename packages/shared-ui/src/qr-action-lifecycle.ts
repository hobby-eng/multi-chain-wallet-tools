const ACTIONS = "[data-qr-action]";
const OPEN_ACTIONS = `${ACTIONS}[data-qr-open]`;

/** The DOM operations of one widget; the registry holds its node weakly. */
export interface QrActionHandlers {
  /** Closes the popover, optionally restoring its trigger's focus. */
  hide(restoreFocus?: boolean): void;
  /** Repositions on a viewport event, ignoring scroll inside the popover. */
  position(target: EventTarget | null): void;
  /** Closes a pinned popover when a pointer press falls outside it. */
  outside(target: EventTarget | null): void;
  /** Revokes exports and releases the widget's retained payload/display state. */
  dispose(): void;
}

/**
 * One document's events, with no strong registry of its QR widgets or their payloads.
 * Removed nodes are disposed when the browser delivers its mutation records; explicit owners
 * may dispose them immediately. Weak keys alone do not promise when garbage collection occurs.
 */
export class QrActionLifecycle {
  static readonly #documents = new WeakMap<Document, QrActionLifecycle>();
  readonly #document: Document;
  readonly #handlers = new WeakMap<Element, QrActionHandlers>();

  private constructor(document: Document) {
    this.#document = document;
    document.defaultView?.addEventListener("blur", () => this.#hide());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.#hide();
    });
    document.defaultView?.addEventListener("pagehide", () => {
      this.#each(ACTIONS, (handlers) => handlers.dispose());
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      this.#each(OPEN_ACTIONS, (handlers) => {
        event.preventDefault();
        handlers.hide(true);
      });
    });
    document.addEventListener("pointerdown", (event) => {
      this.#each(OPEN_ACTIONS, (handlers) => handlers.outside(event.target));
    });
    document.addEventListener(
      "scroll",
      (event) => {
        this.#each(OPEN_ACTIONS, (handlers) => handlers.position(event.target));
      },
      true,
    );
    document.defaultView?.addEventListener("resize", () => {
      this.#each(OPEN_ACTIONS, (handlers) => handlers.position(null));
    });
    const Observer = document.defaultView?.MutationObserver;
    if (Observer !== undefined)
      new Observer((records) => {
        for (const record of records)
          for (const node of record.removedNodes)
            if (node instanceof Element && !node.isConnected) QrActionLifecycle.disposeWithin(node);
      }).observe(document, { childList: true, subtree: true });
  }

  /** Registers widget-local callbacks; the returned unregister drops the weak entry and marker. */
  static register(root: HTMLElement, handlers: QrActionHandlers): () => void {
    const document = root.ownerDocument;
    let lifecycle = this.#documents.get(document);
    if (lifecycle === undefined) {
      lifecycle = new QrActionLifecycle(document);
      this.#documents.set(document, lifecycle);
    }
    const registered = lifecycle;
    lifecycle.#handlers.set(root, handlers);
    root.dataset.qrAction = "";
    return () => {
      registered.#handlers.delete(root);
      delete root.dataset.qrAction;
    };
  }

  /** Closes secret popovers when their enclosing result is concealed manually or automatically. */
  static hideWithin(root: Element): void {
    this.#within(root, (handlers) => handlers.hide());
  }

  /** Revokes and clears QR widgets in a result owner before or after its DOM is removed. */
  static disposeWithin(root: Element): void {
    this.#within(root, (handlers) => handlers.dispose());
  }

  static #within(root: Element, act: (handlers: QrActionHandlers) => void): void {
    const lifecycle = this.#documents.get(root.ownerDocument);
    if (lifecycle === undefined) return;
    const nodes = [...(root.matches(ACTIONS) ? [root] : []), ...root.querySelectorAll(ACTIONS)];
    for (const node of nodes) {
      const handlers = lifecycle.#handlers.get(node);
      if (handlers !== undefined) act(handlers);
    }
  }

  #each(selector: string, act: (handlers: QrActionHandlers) => void): void {
    for (const root of this.#document.querySelectorAll(selector)) {
      const handlers = this.#handlers.get(root);
      if (handlers !== undefined) act(handlers);
    }
  }

  #hide(): void {
    this.#each(OPEN_ACTIONS, (handlers) => handlers.hide());
  }
}
