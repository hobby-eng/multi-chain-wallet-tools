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
import type { ContainerField, PimField, RecoverySettings } from "./recovery-mhfe-fields.js";
import { MissingWordsSearch, type FoundContainer } from "./recovery-mhfe-missing-words.js";
import type { MhfeRun } from "./recovery-mhfe-run.js";
import type { MhfeWaiting } from "./recovery-mhfe-task.js";
import { describe, listed } from "./recovery-mhfe-status.js";
import {
  installSecretToggle,
  paragraph,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";
import { FieldEdits } from "./field-edits.js";
import { MhfeInputLifetime, MhfeInputText } from "@ckd/recovery-backup/mhfe-input-text.js";
import type { MhfeRepair } from "@ckd/recovery-mhfe-wasm/repair/repair.js";
const CARD_REFUSALS = {
  card: "Type the repair words as written on the card.",
  "card-or-search": "Type the repair words as written on the card, or press No repair words.",
} as const;

/** Fixed diagnostics for a missing card; no supplied container or repair words are repeated. */
export class MhfeMarkedContainerError extends Error {
  readonly code: `mhfe.marked.${keyof typeof CARD_REFUSALS}`;
  constructor(code: keyof typeof CARD_REFUSALS) {
    super(CARD_REFUSALS[code]);
    this.name = "MhfeMarkedContainerError";
    this.code = `mhfe.marked.${code}`;
  }
}

/** The tab around a container field. */
export interface MarkedContainerHost {
  /** Names the block's fields, as in `#mhfe-{prefix}-marked`. */
  readonly prefix: string;
  readonly field: ContainerField;
  /** The tab's status line, which says where to go on. */
  readonly status: HTMLElement;
  /**
   * The tab's PIM, and where the tab has the container's password (ContainerPassword) the
   * password and settings for a search with the owner's wallet, after its review (a waiting outcome
   * while that needs an answer); see MissingWordsSearch.
   */
  readonly recovery: {
    readonly pim: Pick<PimField, "settled">;
    settings?(run: MhfeRun): Promise<RecoverySettings | MhfeWaiting>;
  };
  /**
   * Starts the tab's operation again, with the repaired or found container phrase in the field;
   * `foundBy` says what the container's own wallet was matched by, for a check's list of matches.
   */
  readonly resume: (foundBy?: string) => void;
}

/** Bounded container admission and repair prompts; retained input snapshots are wiped on retirement. */
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
  #written: MhfeInputText | undefined;
  readonly #inputLifetime = new MhfeInputLifetime();
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
    const settings = recovery.settings?.bind(recovery);
    this.#search = new MissingWordsSearch(context, engine, host.prefix, this.#status, {
      ...(settings === undefined ? {} : { settings }),
      pim: (maxPim) => recovery.pim.settled(maxPim),
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
      this.#inputLifetime.wipe();
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
    return this.#withInput(run, async (container, repair) => {
      if (!(await this.#inspect(container, repair, run))) return undefined;
      const client = await run.step(() => this.#engine.client());
      const facts = await run.step(() => container.use((text) => client.readContainer(text)));
      return { client, facts };
    });
  }

  /**
   * Reads the container phrase in the field before the tab's operation: true to go on with it
   * (a valid container, or a length no container has, which the operation refuses with its usual
   * message); false when it marks words as ? or is not a container, and the block takes over.
   */
  async ready(run: MhfeRun): Promise<boolean> {
    return this.#withInput(run, (written, repair) => this.#inspect(written, repair, run));
  }

  async #withInput<Result>(
    run: MhfeRun,
    action: (written: MhfeInputText, repair: MhfeRepair) => Promise<Result>,
  ): Promise<Result> {
    const repair = await run.step(() => this.#engine.repair());
    using written = new MhfeInputText(this.#host.field.value);
    return await action(written, repair);
  }

  async #inspect(written: MhfeInputText, repair: MhfeRepair, run: MhfeRun): Promise<boolean> {
    const reading = await run.step(() =>
      written.use((text) => repair.inspectContainer({ container: text })),
    );
    if (reading.reading === "container" || reading.reading === "wrongLength") {
      this.hide();
      return true;
    }
    this.hide();
    const staged = written.copy();
    this.#written = staged;
    let opened = false;
    try {
      await this.#open(reading, staged, run);
      run.assertCurrent();
      this.#host.status.classList.remove("warning");
      this.#host.status.textContent =
        reading.reading === "marked"
          ? "Some words of the container phrase are marked ?: repair them below."
          : "These words are not a container: see below.";
      opened = true;
      return false;
    } finally {
      if (!opened) {
        // An old opening may finish after a replacement; its rollback owns only its own snapshot.
        if (this.#written === staged) this.hide();
        else staged.wipe();
      }
    }
  }

  /** Retires the current input and repair/search presentation, including held byte snapshots. */
  hide(): void {
    this.#revision += 1;
    this.#inputLifetime.wipe();
    this.#block.hidden = true;
    this.#written?.wipe();
    this.#written = undefined;
    this.#card.value = "";
    this.#search.hide();
    this.#result.replaceChildren();
    this.#status.textContent = "";
  }

  async #open(reading: MhfeContainerReading, written: MhfeInputText, run: MhfeRun): Promise<void> {
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
        await run.step(() => written.use((text) => client.readContainer(text)));
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
    this.#inputLifetime.wipe();
    const revision = ++this.#revision;
    const written = this.#written;
    if (written === undefined) return;
    const current = (): boolean => revision === this.#revision;
    this.#status.classList.remove("warning");
    this.#result.replaceChildren();
    try {
      const repaired = await this.#inputLifetime.hold(written.copy(), (container) =>
        this.#inputLifetime.hold(new MhfeInputText(this.#card.value), async (card) => {
          if (card.use((text) => text.trim() === ""))
            throw new MhfeMarkedContainerError(this.#noCard.hidden ? "card" : "card-or-search");
          const repair = await this.#engine.repair();
          if (!current()) return undefined;
          return container.use((text) =>
            card.use((words) => repair.repairContainer({ container: text, card: words })),
          );
        }),
      );
      if (!current() || repaired === undefined) return;
      this.#card.value = "";
      const { said, output, actions, changes } = repairedContainer(repaired, this.#context);
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
    this.#inputLifetime.wipe();
    const revision = ++this.#revision;
    this.#status.classList.remove("warning");
    this.#result.replaceChildren();
    this.#cardField.hidden = true;
    try {
      const written = this.#written;
      if (written === undefined) return;
      await this.#inputLifetime.hold(written.copy(), (container) =>
        container.use((text) => this.#search.show(text)),
      );
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
      this.#context,
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
