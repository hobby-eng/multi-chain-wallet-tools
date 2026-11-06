// Links Generate & Derive through expiring references. A card owns its explicit disclosure and
// clears its DOM when hidden, replaced or expired. The class knows each panel only through the
// phrase slot its feature module describes (recovery-feature.ts).
import type { RecoveryPhraseSlot } from "./recovery-feature.js";
import type { RecoverySourceReference, RecoverySourceTarget } from "./recovery-source-link.js";
import { required } from "./recovery-workspace-shared.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

const SOURCE_CHANGED = "The linked source changed or was cleared. Choose the source again.";
const ERRORS = new ErrorCatalog("recovery.linked-source", {
  changed: () => SOURCE_CHANGED,
  unavailable: () => "The selected recovery feature is not included in this build.",
});

interface LinkedPhraseView {
  readonly toggle: HTMLButtonElement;
  readonly phrase: HTMLTextAreaElement;
  readonly problem: HTMLElement;
}

interface LinkedSource {
  readonly reference: RecoverySourceReference;
  card?: HTMLElement;
}

/** Owns linked source capabilities and the DOM cards that may currently reveal them. */
export class LinkedSources {
  readonly #slots: ReadonlyMap<RecoverySourceTarget, RecoveryPhraseSlot>;
  readonly #linked = new Map<RecoverySourceTarget, LinkedSource>();
  /** Linked phrases the user chose to show, with the function that hides each again. */
  readonly #revealed = new Map<RecoverySourceTarget, () => void>();
  /** Links whose phrase was changed or cleared in Generate & Derive, already announced. */
  readonly #expired = new Set<RecoverySourceTarget>();
  /** The phrase of Generate & Derive while it is valid; each panel offers it until one is entered. */
  #offered: RecoverySourceReference | null = null;
  readonly #offers = new Map<RecoverySourceTarget, HTMLElement>();

  /** The build supplies only its included phrase slots. */
  constructor(slots: readonly RecoveryPhraseSlot[]) {
    this.#slots = new Map(slots.map((slot) => [slot.target, slot]));
  }

  /**
   * Adds the offer to every panel, and hides linked phrases again when the window loses focus or the
   * user leaves Recover & Back Up, like the phrase field in Generate & Derive.
   */
  install(): void {
    for (const slot of this.#slots.values()) this.#installOffer(slot);
    const concealAll = (): void => {
      // Concealment removes entries and dispatches events; this pass owns only its starting set.
      const visible = Array.from(this.#revealed.values());
      for (const conceal of visible) conceal();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") concealAll();
    });
    window.addEventListener("blur", concealAll);
    document.querySelector("#derive-generate-mode")?.addEventListener("click", concealAll);
  }

  /** Retire visible expired sources while publishing the current offer to included slots. */
  offer(reference: RecoverySourceReference | null): void {
    this.#offered = reference;
    for (const target of this.#offers.keys()) this.#updateOffer(target);
    // The phrase of Generate & Derive changed or was cleared: a panel linked to it drops what it
    // made from it (an encoded record, card QR images), as on any change of its source. The link
    // stays and says it changed when it is used.
    // Visibility handlers may replace links; this pass owns only the links present at its start.
    for (const [target, linked] of Array.from(this.#linked))
      if (
        this.#linked.get(target) === linked &&
        !this.#expired.has(target) &&
        linked.reference.read() === null &&
        this.#linked.get(target) === linked
      ) {
        this.#expired.add(target);
        this.#revealed.get(target)?.();
        if (this.#linked.get(target) === linked)
          document.dispatchEvent(new CustomEvent("recovery-source-change", { detail: target }));
      }
  }

  /** The linked phrase and passphrase, or null when the panel's own fields are used. */
  linkedValue(target: RecoverySourceTarget): { mnemonic: string; passphrase: string } | null {
    const linked = this.#linked.get(target);
    if (linked === undefined) return null;
    const value = linked.reference.read();
    if (value === null) throw ERRORS.create("changed", []);
    return value;
  }

  /** Read the current capability only when requested, falling back to the manual field. */
  readMnemonic(target: RecoverySourceTarget, selector: string): string {
    return this.linkedValue(target)?.mnemonic ?? required<HTMLTextAreaElement>(selector).value;
  }

  /** True while the linked phrase is shown in its card. */
  isRevealed(target: RecoverySourceTarget): boolean {
    return this.#revealed.has(target);
  }

  /** Atomically replace a slot; reentrant event handlers may supersede this particular link. */
  use(reference: RecoverySourceReference, target: RecoverySourceTarget): void {
    const slot = this.#slots.get(target);
    if (slot === undefined) throw ERRORS.create("unavailable", []);
    // Replacement publishes one change after installing its new identity, not an intermediate unlink.
    this.#unlink(slot, false);
    const manualElements = manualFieldElements(slot);
    for (const element of manualElements) element.hidden = true;
    required<HTMLTextAreaElement>(slot.phraseField).value = "";
    if (slot.passphraseField !== undefined)
      required<HTMLInputElement | HTMLTextAreaElement>(slot.passphraseField).value = "";
    const linked: LinkedSource = { reference };
    this.#linked.set(target, linked);
    this.#expired.delete(target);
    document.dispatchEvent(new CustomEvent("recovery-source-change", { detail: target }));
    if (this.#linked.get(target) !== linked) return;
    this.#updateOffer(target);
    const panel = required<HTMLElement>(`#${slot.panelId}`);
    const card = this.#linkedCard(slot, linked);
    linked.card = card;
    const anchor = manualElements[0] ?? panel.firstElementChild;
    if (anchor === null) panel.append(card);
    else anchor.before(card);
    document
      .querySelector<HTMLButtonElement>(`[data-recovery-tab][aria-controls="${slot.panelId}"]`)
      ?.click();
    if (this.#linked.get(target) !== linked) return;
    // Panels with operation tabs open their backup tab; the Wallet Matcher has none.
    document
      .querySelector<HTMLButtonElement>(
        `#${slot.panelId} [data-operation-tab][aria-controls="${target}-create-panel"]`,
      )
      ?.click();
  }

  #unlink(slot: RecoveryPhraseSlot, announce = true): void {
    const linked = this.#linked.get(slot.target);
    const conceal = this.#revealed.get(slot.target);
    this.#linked.delete(slot.target);
    this.#expired.delete(slot.target);
    this.#revealed.delete(slot.target);
    // The callback clears its own DOM even after it has lost authority over the slot.
    conceal?.();
    linked?.card?.remove();
    for (const element of manualFieldElements(slot)) element.hidden = false;
    this.#updateOffer(slot.target);
    if (announce)
      document.dispatchEvent(new CustomEvent("recovery-source-change", { detail: slot.target }));
  }

  #installOffer(slot: RecoveryPhraseSlot): void {
    const offer = document.createElement("div");
    offer.className = "recovery-source-offer";
    offer.hidden = true;
    const text = document.createElement("span");
    text.textContent =
      "A recovery phrase is entered in Generate & Derive. It can be used here without copying it.";
    const use = document.createElement("button");
    use.type = "button";
    use.className = "secondary compact";
    use.textContent = "Import from Generate & Derive";
    use.addEventListener("click", () => {
      if (this.#offered !== null) this.use(this.#offered, slot.target);
    });
    offer.append(text, use);
    manualFieldElements(slot)[0]?.before(offer);
    required<HTMLTextAreaElement>(slot.phraseField).addEventListener("input", () =>
      this.#updateOffer(slot.target),
    );
    this.#offers.set(slot.target, offer);
  }

  /** Shows the offer only where it helps: a phrase is available, nothing is linked and the field is empty. */
  #updateOffer(target: RecoverySourceTarget): void {
    const offer = this.#offers.get(target);
    const slot = this.#slots.get(target);
    if (offer === undefined || slot === undefined) return;
    offer.hidden =
      this.#offered === null ||
      this.#linked.has(target) ||
      required<HTMLTextAreaElement>(slot.phraseField).value.trim() !== "";
  }

  #linkedCard(slot: RecoveryPhraseSlot, linked: LinkedSource): HTMLElement {
    const reference = linked.reference;
    const card = document.createElement("div");
    card.className = "linked-recovery-source";
    card.dataset.linkedSourceFor = slot.target;
    const description = document.createElement("div");
    description.className = "linked-source-description";
    const heading = document.createElement("div");
    heading.className = "linked-source-heading";
    const title = document.createElement("strong");
    const sourceLabel = `${reference.label.slice(0, 1).toLowerCase()}${reference.label.slice(1)}`;
    title.textContent = `Using ${sourceLabel}`;
    heading.append(title, linkedSourceHelp());
    const origin = document.createElement("span");
    origin.textContent = "Selected in Generate & Derive.";
    const note = document.createElement("span");
    note.textContent = slot.linkedNote;
    description.append(heading, origin, note);
    const unlink = document.createElement("button");
    unlink.type = "button";
    unlink.className = "secondary compact";
    unlink.textContent = "Enter another phrase";
    unlink.addEventListener("click", () => {
      if (this.#linked.get(slot.target) === linked) this.#unlink(slot);
    });
    const summary = document.createElement("div");
    summary.className = "linked-source-summary";
    const actions = document.createElement("div");
    actions.className = "linked-source-actions";
    const phraseView = this.#linkedPhraseView(slot.target, linked);
    actions.append(phraseView.toggle, unlink);
    summary.append(description, actions);
    card.append(summary, phraseView.phrase, phraseView.problem);
    return card;
  }

  /**
   * Show/Hide for the linked phrase. Showing reads the in-memory reference and places the words in a
   * read-only field inside the card; hiding removes them from the DOM again.
   */
  #linkedPhraseView(target: RecoverySourceTarget, linked: LinkedSource): LinkedPhraseView {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "danger-outline compact";
    const phrase = document.createElement("textarea");
    phrase.className = "linked-source-phrase";
    phrase.rows = 3;
    phrase.readOnly = true;
    phrase.setAttribute("aria-label", `${linked.reference.label} (read-only)`);
    const problem = document.createElement("p");
    problem.className = "error";
    problem.setAttribute("role", "alert");
    const render = (revealed: boolean): void => {
      toggle.textContent = revealed ? "Hide phrase" : "Show phrase";
      toggle.setAttribute("aria-pressed", String(revealed));
      phrase.hidden = !revealed;
      if (!revealed) phrase.value = "";
    };
    const conceal = (): void => {
      if (this.#revealed.get(target) !== conceal) {
        render(false);
        return;
      }
      this.#revealed.delete(target);
      render(false);
      document.dispatchEvent(new CustomEvent("recovery-source-visibility", { detail: target }));
    };
    toggle.addEventListener("click", () => {
      if (!toggle.isConnected || this.#linked.get(target) !== linked) return;
      problem.hidden = true;
      if (this.#revealed.has(target)) {
        conceal();
        return;
      }
      const value = linked.reference.read();
      if (!toggle.isConnected || this.#linked.get(target) !== linked) return;
      if (value === null) {
        problem.textContent = SOURCE_CHANGED;
        problem.hidden = false;
        return;
      }
      phrase.value = value.mnemonic;
      this.#revealed.set(target, conceal);
      render(true);
      document.dispatchEvent(new CustomEvent("recovery-source-visibility", { detail: target }));
    });
    problem.hidden = true;
    render(false);
    return { toggle, phrase, problem };
  }
}

/** The manual fields a linked phrase replaces: the slot's block, or the phrase and passphrase fields with their labels. */
function manualFieldElements(slot: RecoveryPhraseSlot): HTMLElement[] {
  if (slot.manualBlock !== undefined) {
    const block = document.querySelector<HTMLElement>(slot.manualBlock);
    return block === null ? [] : [block];
  }
  const input = required<HTMLTextAreaElement>(slot.phraseField);
  const heading =
    input.previousElementSibling instanceof HTMLElement ? input.previousElementSibling : null;
  const elements = heading === null ? [input] : [heading, input];
  if (slot.passphraseField !== undefined) {
    const passphrase = required<HTMLInputElement>(slot.passphraseField);
    const label = document.querySelector<HTMLElement>(`label[for="${passphrase.id}"]`);
    if (label !== null) elements.push(label);
    elements.push(passphrase);
  }
  return elements;
}

function linkedSourceHelp(): HTMLDetailsElement {
  const help = document.createElement("details");
  help.className = "linked-source-help";
  const summary = document.createElement("summary");
  summary.textContent = "?";
  summary.setAttribute("aria-label", "How the linked phrase is protected");
  const popover = document.createElement("div");
  popover.className = "linked-source-help-popover";
  const title = document.createElement("strong");
  title.textContent = "Kept inside this offline workspace";
  const text = document.createElement("p");
  text.textContent =
    "The recovery phrase and passphrase remain inside this offline page. Choose Show phrase to display the linked phrase. The card hides it when the source changes, the card is replaced or the window loses focus. This link does not copy these values to the OS clipboard or send them over the network.";
  popover.append(title, text);
  help.append(summary, popover);
  return help;
}
