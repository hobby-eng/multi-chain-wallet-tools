// A container phrase as typed where it is decrypted, checked, rekeyed or opened, read first as
// `mhfe` reads it (mhfe src/bin/mhfe/container_repair.rs, MhfeRepair.inspectContainer): words typed
// as ? ask for the repair words at once, or for a search without them (MissingWordsSearch); words
// that are not a container say why and offer to type them again or to repair them. A repaired or
// found container phrase is shown with every change and used only after the person says so; the
// tab's operation then starts again with it.
import type { MhfeClient, MhfeContainerFacts } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeContainerReading } from "@ckd/recovery-mhfe-wasm/repair/repair.js";
import {
  concealedContainer,
  concealedWith,
  containerHeading,
  repairedContainer,
} from "./recovery-mhfe-cards.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import type { ContainerField, RecoverySettings } from "./recovery-mhfe-fields.js";
import { MissingWordsSearch, type FoundContainer } from "./recovery-mhfe-missing-words.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import { describe, listed } from "./recovery-mhfe-status.js";
import {
  installSecretToggle,
  paragraph,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";
import { FieldEdits } from "./field-edits.js";

/** The tab around a container field. */
export interface MarkedContainerHost {
  /** Names the block's fields, as in `#mhfe-{prefix}-marked`. */
  readonly prefix: string;
  readonly field: ContainerField;
  /** The tab's status line, which says where to go on. */
  readonly status: HTMLElement;
  /**
   * The tab's PIM, and where the tab has the container's password (ContainerPassword) the
   * password and settings for a search with the owner's wallet, after its review (AwaitingAnswer
   * while that needs an answer); see MissingWordsSearch.
   */
  readonly recovery: {
    readonly pim: { value(): number };
    settings?(run: MhfeRun): Promise<RecoverySettings>;
  };
  /**
   * Starts the tab's operation again, with the repaired or found container phrase in the field;
   * `foundBy` says what the container's own wallet was matched by, for a check's list of matches.
   */
  readonly resume: (foundBy?: string) => void;
}

export class MarkedContainer {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #host: MarkedContainerHost;
  readonly #block: HTMLElement;
  readonly #reading: HTMLElement;
  readonly #againChoice: HTMLElement;
  readonly #cardField: HTMLElement;
  readonly #card: HTMLTextAreaElement;
  readonly #noCard: HTMLButtonElement;
  readonly #noCardNote: HTMLElement;
  readonly #status: HTMLElement;
  readonly #result: HTMLElement;
  readonly #search: MissingWordsSearch;
  /** The container phrase as typed when the block opened: a repair applies to it only. */
  #written = "";
  #revision = 0;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine, host: MarkedContainerHost) {
    this.#context = context;
    this.#engine = engine;
    this.#host = host;
    const prefix = `mhfe-${host.prefix}-marked`;
    this.#block = required<HTMLElement>(`#${prefix}`);
    this.#reading = required<HTMLElement>(`#${prefix}-reading`);
    this.#againChoice = required<HTMLElement>(`#${prefix}-again-choice`);
    this.#cardField = required<HTMLElement>(`#${prefix}-card-field`);
    this.#card = required<HTMLTextAreaElement>(`#${prefix}-card`);
    this.#noCard = required<HTMLButtonElement>(`#${prefix}-no-card`);
    this.#noCardNote = required<HTMLElement>(`#${prefix}-no-card-note`);
    this.#status = required<HTMLElement>(`#${prefix}-status`);
    this.#result = required<HTMLElement>(`#${prefix}-result`);
    installSecretToggle(
      `#toggle-${prefix}-card`,
      `#${prefix}-card`,
      "Show",
      "Hide",
      "repair words",
    );
    const { recovery } = host;
    this.#search = new MissingWordsSearch(context, engine, host.prefix, this.#status, {
      ...(recovery.settings === undefined ? {} : { settings: (run) => recovery.settings!(run) }),
      pim: () => recovery.pim.value(),
      found: (found) => this.#offerFound(found),
      back: () => this.#typeAgain(),
    });
    for (const id of [`#${prefix}-again`, `#${prefix}-back`])
      required<HTMLButtonElement>(id).addEventListener("click", () => this.#typeAgain());
    required<HTMLButtonElement>(`#${prefix}-repair-it`).addEventListener("click", () =>
      this.#askCard(false),
    );
    required<HTMLButtonElement>(`#${prefix}-repair`).addEventListener(
      "click",
      () => void this.#repair(),
    );
    this.#noCard.addEventListener("click", () => void this.#searchWithoutCard());
    // What the block says belongs to the words it read: typing them again closes it.
    const edits = new FieldEdits();
    for (const type of ["input", "change"])
      host.field.textarea.addEventListener(type, (event) => {
        if (edits.isNew(event)) this.hide();
      });
    this.#card.addEventListener("input", () => {
      this.#revision += 1;
      this.#result.replaceChildren();
    });
    document.querySelector("#clear-all")?.addEventListener("click", () => this.hide());
    window.addEventListener("pagehide", () => this.hide());
    this.hide();
  }

  /**
   * The container phrase in the field as the package reads it, with the client that read it, for
   * the tab's operation; undefined when the block took over (see ready).
   */
  async read(run: MhfeRun): Promise<{ client: MhfeClient; facts: MhfeContainerFacts } | undefined> {
    const container = this.#host.field.value;
    if (!(await this.ready(run))) return undefined;
    const client = await run.step(() => this.#engine.client());
    const facts = await run.step(() => client.readContainer(container));
    return { client, facts };
  }

  /**
   * Reads the container phrase in the field before the tab's operation: true to go on with it
   * (a valid container, or a length no container has, which the operation refuses with its usual
   * message); false when it marks words as ? or is not a container, and the block takes over.
   */
  async ready(run: MhfeRun): Promise<boolean> {
    const written = this.#host.field.value;
    const repair = await run.step(() => this.#engine.repair());
    const reading = await run.step(() => repair.inspectContainer({ container: written }));
    if (reading.reading === "container" || reading.reading === "wrongLength") {
      this.hide();
      return true;
    }
    this.#written = written;
    await this.#open(reading, run);
    run.assertCurrent();
    this.#host.status.classList.remove("warning");
    this.#host.status.textContent =
      reading.reading === "marked"
        ? "Some words of the container phrase are marked ?: repair them below."
        : "These words are not a container: see below.";
    return false;
  }

  hide(): void {
    this.#revision += 1;
    this.#block.hidden = true;
    this.#written = "";
    this.#card.value = "";
    this.#search.hide();
    this.#result.replaceChildren();
    this.#status.textContent = "";
  }

  async #open(reading: MhfeContainerReading, run: MhfeRun): Promise<void> {
    this.#result.replaceChildren();
    this.#status.textContent = "";
    this.#search.hide();
    if (reading.reading === "marked") {
      const count = reading.unreadable.length;
      this.#reading.textContent =
        `${count === 1 ? "Word" : "Words"} ${listed(reading.unreadable)} of the container phrase ` +
        `cannot be read. Type its repair words to repair ${count === 1 ? "it" : "them"}.`;
      this.#againChoice.hidden = true;
      this.#askCard(true);
    } else {
      // A typing mistake, most often: said as reading the container would say it.
      const client = await run.step(() => this.#engine.client());
      let why = "These words are not a container phrase.";
      try {
        await run.step(() => client.readContainer(this.#written));
      } catch (cause) {
        run.assertCurrent();
        why = describe(cause, why);
      }
      this.#reading.textContent = `${why} Type it again after a typing mistake, or repair it with its repair words from the card kept apart from it.`;
      this.#againChoice.hidden = false;
      this.#cardField.hidden = true;
    }
    this.#block.hidden = false;
  }

  /** The card's field; `marked` offers the search without the repair words. */
  #askCard(marked: boolean): void {
    this.#againChoice.hidden = true;
    this.#cardField.hidden = false;
    this.#noCard.hidden = !marked;
    this.#noCardNote.hidden = !marked;
  }

  #typeAgain(): void {
    this.hide();
    this.#host.status.textContent = "Type the container phrase again.";
    this.#host.field.textarea.focus();
  }

  async #repair(): Promise<void> {
    const revision = ++this.#revision;
    const container = this.#written;
    const card = this.#card.value;
    const current = (): boolean => revision === this.#revision;
    this.#status.classList.remove("warning");
    this.#result.replaceChildren();
    try {
      if (card.trim() === "")
        throw new Error(
          this.#noCard.hidden
            ? "Type the repair words as written on the card."
            : "Type the repair words as written on the card, or press No repair words.",
        );
      const repair = await this.#engine.repair();
      if (!current()) return;
      const repaired = await repair.repairContainer({
        container,
        card,
      });
      if (!current()) return;
      this.#card.value = "";
      const { said, output, actions, changes } = repairedContainer(
        repaired,
        this.#context.writeClipboard,
      );
      this.#offer(
        containerHeading("Repaired container phrase", repaired.container),
        repaired.container,
        [said, output, actions, changes],
        "Use it, and correct your written phrase: the repair words fix this copy only.",
      );
    } catch (cause) {
      if (!current()) return;
      this.#say(describe(cause, "The repair failed."), true);
    }
  }

  async #searchWithoutCard(): Promise<void> {
    const revision = ++this.#revision;
    this.#status.classList.remove("warning");
    this.#result.replaceChildren();
    this.#cardField.hidden = true;
    try {
      await this.#search.show(this.#written);
    } catch (cause) {
      if (revision !== this.#revision) return;
      this.#cardField.hidden = false;
      this.#say(describe(cause, "The search cannot run."), true);
    }
  }

  #offerFound(found: FoundContainer): void {
    this.#search.hide();
    const { output, actions } = concealedContainer(
      found.container,
      "Found MHFE container QR",
      this.#context.writeClipboard,
    );
    // The words found are words of the container: shown and hidden with it, never in a summary.
    const places = paragraph(
      `Found ${found.words.map(({ position, word }) => `word ${position}: ${word}`).join(", ")}, ${found.how}.`,
      "success-callout",
    );
    concealedWith(places, output, actions);
    this.#offer(
      containerHeading("Found container phrase", found.container),
      found.container,
      [output, actions, places],
      "Use it, and write the found words on your copy of the container phrase.",
      found.foundBy,
    );
  }

  /** Shows a container phrase to use, with Use it and Type the container phrase again. */
  #offer(
    heading: HTMLElement,
    container: string,
    parts: readonly HTMLElement[],
    useNote: string,
    foundBy?: string,
  ): void {
    const use = document.createElement("button");
    use.type = "button";
    use.className = "primary";
    use.textContent = "Use it";
    use.addEventListener("click", () => this.#use(container, foundBy));
    const again = document.createElement("button");
    again.type = "button";
    again.className = "secondary";
    again.textContent = "Type the container phrase again";
    again.addEventListener("click", () => this.#typeAgain());
    const choice = document.createElement("div");
    choice.className = "actions";
    choice.append(use, again);
    this.#result.replaceChildren(heading, ...parts, paragraph(useNote, "field-note"), choice);
    this.#say("", false);
  }

  #use(container: string, foundBy?: string): void {
    this.hide();
    const field = this.#host.field.textarea;
    field.value = container;
    // The tabs that adapt to the container read it again on "change".
    field.dispatchEvent(new Event("change", { bubbles: true }));
    this.#host.resume(foundBy);
  }

  #say(text: string, warning: boolean): void {
    this.#status.textContent = text;
    this.#status.classList.toggle("warning", warning);
  }
}
