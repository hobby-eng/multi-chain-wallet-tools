/** Local recovery controls share one concealment lifecycle, independent of Deriver reveal flags. */
export class RecoverySecretLifecycle {
  static readonly #instances = new WeakMap<Document, RecoverySecretLifecycle>();
  static readonly #SELECTOR = "[data-recovery-secret-control]";
  static readonly #CONCEAL = "recovery-secret-conceal";
  readonly #document: Document;

  private constructor(document: Document) {
    this.#document = document;
    // The window of the document this lifecycle owns, not whichever global happens to be current.
    document.defaultView?.addEventListener("blur", () => this.conceal());
    document.defaultView?.addEventListener("pagehide", () => this.conceal());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.conceal();
    });
  }

  static install(document: Document): RecoverySecretLifecycle {
    let lifecycle = this.#instances.get(document);
    if (lifecycle === undefined) {
      const owner = new RecoverySecretLifecycle(document);
      this.#instances.set(document, owner);
      // Editing preserves an explicit Show choice; Clear is a concealment boundary.
      document.querySelector("#clear-all")?.addEventListener("click", () => owner.conceal());
      lifecycle = owner;
    }
    return lifecycle;
  }

  /** Keep the callback on its control, so removed result cards are never retained by the host. */
  static register(control: HTMLElement, conceal: () => void): void {
    this.install(control.ownerDocument);
    control.dataset.recoverySecretControl = "";
    control.addEventListener(this.#CONCEAL, conceal);
  }

  /** Diagnostics that follow a manual field also follow its automatic concealment. */
  static onConceal(control: HTMLElement, listener: () => void): void {
    control.addEventListener(this.#CONCEAL, listener);
  }

  /** Resets one result's disclosure without concealing unrelated input fields. */
  static concealControl(control: HTMLElement): void {
    control.dispatchEvent(new Event(this.#CONCEAL));
  }

  /** Conceals every registered control in `root`: the whole page, or a self-test's own fixture. */
  conceal(root: ParentNode = this.#document): void {
    for (const control of root.querySelectorAll<HTMLElement>(RecoverySecretLifecycle.#SELECTOR))
      RecoverySecretLifecycle.concealControl(control);
  }
}
