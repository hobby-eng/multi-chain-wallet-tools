// The Repair tab of the MHFE panel: repairs the words of a container phrase from its repair words
// (`mhfe repair`), and makes repair words for an existing container (`mhfe repair-words`). Both are
// quick: no Argon2 and no password.
import {
  containerHeading,
  factsList,
  fingerprintLine,
  repairCard,
  repairedContainer,
  whatWasRepaired,
} from "./recovery-mhfe-cards.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";
import { MhfeInputLifetime, MhfeInputText } from "@ckd/recovery-backup/mhfe-input-text.js";
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
  readonly #inputLifetime = new MhfeInputLifetime();

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
      this.#inputLifetime.wipe();
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
    this.#inputLifetime.wipe();
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
    const repair = await this.#engine.repair();
    if (!current()) return;
    const repaired = await this.#inputLifetime.hold(
      new MhfeInputText(this.#written.value),
      (container) =>
        this.#inputLifetime.hold(new MhfeInputText(this.#card.value), (card) =>
          container.use((text) =>
            card.use((repairWords) =>
              repair.repairContainer({ container: text, card: repairWords }),
            ),
          ),
        ),
    );
    if (!current()) return;
    if (repaired.unchanged) {
      this.#repairResult.append(paragraph(whatWasRepaired(repaired), "success-callout"));
      return;
    }
    const { said, output, actions, changes } = repairedContainer(repaired, this.#context);
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
    const repair = await this.#engine.repair();
    const parameters = await repair.parameters();
    if (!current()) return;
    const count = selectedRepairCount("mhfe-repair-words-count", parameters, "required");
    const card = await this.#inputLifetime.hold(
      new MhfeInputText(this.#container.value),
      (container) => container.use((text) => repair.repairWords({ container: text, count })),
    );
    if (!current()) return;
    this.#wordsResult.append(
      repairCard(card.words, card.profile, this.#context),
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
