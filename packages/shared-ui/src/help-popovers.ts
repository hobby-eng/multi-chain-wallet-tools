// The "?" and "More details" popovers of the tools. A popover opens while the pointer rests on it
// and closes when the pointer leaves; a click pins it open until a second click, a click elsewhere
// or Escape. An opened popover moves sideways as far as it must to stay inside the window.

const HELP_CLASSES = [".recovery-help", ".linked-source-help", ".threshold-group-help"];
const HELP_SELECTOR = HELP_CLASSES.join(", ");
const OPEN_HELP_SELECTOR = HELP_CLASSES.map((selector) => `${selector}[open]`).join(", ");
/** The room a popover keeps from the window's sides: the page's own side margin. */
const WINDOW_MARGIN = 16;

export class HelpPopovers {
  readonly #pinned = new WeakSet<HTMLDetailsElement>();
  /** Closed by a click while the pointer is still on it; it must not reopen until the pointer leaves. */
  readonly #suppressedUntilPointerLeaves = new WeakSet<HTMLDetailsElement>();

  install(document: Document): void {
    document.addEventListener("pointerover", (event) => {
      const help = this.#hoveredHelp(event);
      if (help !== null && !this.#suppressedUntilPointerLeaves.has(help)) this.#open(help);
    });
    document.addEventListener("pointerout", (event) => {
      const help = this.#hoveredHelp(event);
      if (help === null) return;
      this.#suppressedUntilPointerLeaves.delete(help);
      if (!this.#pinned.has(help)) help.open = false;
    });
    document.addEventListener("click", (event) => this.#togglePinned(event));
    document.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Node) this.#closeAll(document, event.target);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.#closeAll(document);
    });
    // A narrower window or a turned phone moves a pinned popover's edges: fit it again.
    document.defaultView?.addEventListener("resize", () => {
      for (const help of document.querySelectorAll<HTMLDetailsElement>(OPEN_HELP_SELECTOR))
        HelpPopovers.#fit(help);
    });
  }

  /** The popover a mouse or pen entered or left; a move within one popover does not count. */
  #hoveredHelp(event: PointerEvent): HTMLDetailsElement | null {
    if (event.pointerType === "touch") return null;
    const help = helpFromEvent(event);
    if (help === null) return null;
    return event.relatedTarget instanceof Node && help.contains(event.relatedTarget) ? null : help;
  }

  #togglePinned(event: MouseEvent): void {
    const summary =
      event.target instanceof Element ? event.target.closest<HTMLElement>("summary") : null;
    if (summary === null) return;
    const help = summary.parentElement;
    if (!(help instanceof HTMLDetailsElement) || !help.matches(HELP_SELECTOR)) return;
    event.preventDefault();
    if (this.#pinned.has(help)) {
      this.#pinned.delete(help);
      this.#suppressedUntilPointerLeaves.add(help);
      help.open = false;
    } else {
      this.#pinned.add(help);
      this.#suppressedUntilPointerLeaves.delete(help);
      this.#open(help);
    }
  }

  #open(help: HTMLDetailsElement): void {
    help.open = true;
    HelpPopovers.#fit(help);
  }

  /** Moves the popover of an open `help` into the window, which a "?" near a side would cross. */
  static #fit(help: HTMLDetailsElement): void {
    const popover = help.querySelector<HTMLElement>(":scope > :not(summary)");
    if (popover === null) return;
    popover.style.removeProperty("translate");
    const box = popover.getBoundingClientRect();
    const right = help.ownerDocument.documentElement.clientWidth - WINDOW_MARGIN;
    const shift =
      box.left < WINDOW_MARGIN ? WINDOW_MARGIN - box.left : Math.min(0, right - box.right);
    if (shift !== 0) popover.style.translate = `${shift}px`;
  }

  /** Closes every open popover, except the one that contains `keep`. */
  #closeAll(document: Document, keep?: Node): void {
    for (const help of document.querySelectorAll<HTMLDetailsElement>(OPEN_HELP_SELECTOR)) {
      if (keep !== undefined && help.contains(keep)) continue;
      this.#pinned.delete(help);
      this.#suppressedUntilPointerLeaves.delete(help);
      help.open = false;
    }
  }
}

function helpFromEvent(event: Event): HTMLDetailsElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLDetailsElement>(HELP_SELECTOR)
    : null;
}
