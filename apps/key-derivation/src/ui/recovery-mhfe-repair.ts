// The Repair tab of the MHFE panel: repairs the words of a container phrase from its repair words
// (`mhfe repair`), and makes repair words for an existing container (`mhfe repair-words`). Both are
// quick: no Argon2 and no password.
import {
  containerHeading,
  factsList,
  fingerprintLine,
  repairCard,
  repairedContainer,
} from "./recovery-mhfe-cards.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { InputRevision } from "./recovery-input-revision.js";
import { ContainerField, selectedRepairCount } from "./recovery-mhfe-fields.js";
import { describe } from "./recovery-mhfe-status.js";
import {
  installSecretToggle,
  paragraph,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";

export class MhfeRepairTab {
  readonly #context: RecoveryFeatureContext;
  readonly #engine: MhfeEngine;
  readonly #written = required<HTMLTextAreaElement>("#mhfe-repair-container");
  readonly #card = required<HTMLTextAreaElement>("#mhfe-repair-card");
  readonly #repairResult = required<HTMLElement>("#mhfe-repair-container-result");
  readonly #wordsResult = required<HTMLElement>("#mhfe-repair-words-result");
  readonly #container: ContainerField;
  readonly #inputs: InputRevision;

  constructor(context: RecoveryFeatureContext, engine: MhfeEngine) {
    this.#context = context;
    this.#engine = engine;
    installSecretToggle(
      "#toggle-mhfe-repair-container",
      "#mhfe-repair-container",
      "Show",
      "Hide",
      "container phrase",
    );
    installSecretToggle(
      "#toggle-mhfe-repair-card",
      "#mhfe-repair-card",
      "Show",
      "Hide",
      "repair words",
    );
    this.#container = new ContainerField("mhfe-repair-words-container", this.#wordsResult);
    this.#inputs = new InputRevision(required<HTMLElement>("#mhfe-repair-panel"), () => {
      this.#repairResult.replaceChildren();
      this.#wordsResult.replaceChildren();
    });
    this.#inputs.bindPageLifetime();
    const repairButton = required<HTMLButtonElement>("#mhfe-repair-container-run");
    repairButton.addEventListener("click", () =>
      this.#runQuick(repairButton, this.#repairResult, (current) => this.#repairContainer(current)),
    );
    const wordsButton = required<HTMLButtonElement>("#mhfe-repair-words-run");
    wordsButton.addEventListener("click", () =>
      this.#runQuick(wordsButton, this.#wordsResult, (current) => this.#makeRepairWords(current)),
    );
  }

  /** A quick call disables only its own button while it runs; there is nothing to cancel. */
  #runQuick(
    button: HTMLButtonElement,
    result: HTMLElement,
    operation: (current: () => boolean) => Promise<void>,
  ): void {
    if (button.disabled) return;
    const current = this.#inputs.capture();
    button.disabled = true;
    result.replaceChildren();
    operation(current)
      .catch((cause: unknown) => {
        if (!current()) return;
        result.replaceChildren(paragraph(describe(cause, "The repair failed."), "warning-callout"));
      })
      .finally(() => {
        button.disabled = false;
      });
  }

  async #repairContainer(current: () => boolean): Promise<void> {
    const container = this.#written.value;
    const card = this.#card.value;
    const repair = await this.#engine.repair();
    if (!current()) return;
    const repaired = await repair.repairContainer({
      container,
      card,
    });
    if (!current()) return;
    if (repaired.unchanged) {
      this.#repairResult.append(repairedContainer(repaired, this.#context.writeClipboard).said);
      return;
    }
    const { said, output, actions, changes } = repairedContainer(
      repaired,
      this.#context.writeClipboard,
    );
    const useInDecode = document.createElement("button");
    useInDecode.type = "button";
    useInDecode.className = "secondary compact";
    useInDecode.textContent = "Use in Decode";
    useInDecode.addEventListener("click", () => {
      if (!current()) return;
      const field = required<HTMLTextAreaElement>("#mhfe-container");
      field.value = repaired.container;
      field.dispatchEvent(new Event("change", { bubbles: true }));
      document
        .querySelector<HTMLButtonElement>(
          '#mhfe-panel [data-operation-tab][aria-controls="mhfe-restore-panel"]',
        )
        ?.click();
    });
    actions.append(useInDecode);
    this.#repairResult.append(
      containerHeading("Repaired container", repaired.container),
      said,
      output,
      actions,
      changes,
      paragraph(fingerprintLine(repaired.containerFingerprint, "container"), "field-note"),
      paragraph(
        "Correct your written container phrase, then rehearse the recovery in Decode or Check with the words " +
          "typed from it. Damage beyond the repair words' bound, or a card from another container phrase, can " +
          "give a wrong container that passes the checksum: a repair does not confirm your wallet.",
        "warning-callout",
      ),
    );
  }

  async #makeRepairWords(current: () => boolean): Promise<void> {
    const count = selectedRepairCount("mhfe-repair-words-count");
    const container = this.#container.value;
    const repair = await this.#engine.repair();
    if (!current()) return;
    const card = await repair.repairWords({
      container,
      count: count as 2 | 4 | 6 | 8,
    });
    if (!current()) return;
    this.#wordsResult.append(
      repairCard(card.words, card.profile, this.#context.writeClipboard),
      factsList([
        ["Repairs", `${card.repairsUnreadable} unreadable or ${card.repairsWrong} wrong words`],
        ["Keep", "the repair words on a card, apart from the container phrase"],
      ]),
      paragraph(
        "These words fit only this container. A new password or new settings give a new container, which " +
          "needs a new card. Make them from a container whose recovery you have rehearsed: words made from a " +
          "miscopied container repair a container phrase into the miscopied one.",
        "field-note",
      ),
    );
  }
}
