// The package owns numerical limits and repair choices; the page renders its parameters only.
import type { MhfeParameters } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeEngine } from "./recovery-mhfe-engine.js";

export class MhfePanelParameters {
  readonly #panel: HTMLElement;

  constructor(panel: HTMLElement, engine: MhfeEngine) {
    this.#panel = panel;
    engine.whenPassed(() => void this.#load(engine));
  }

  async #load(engine: MhfeEngine): Promise<void> {
    try {
      this.apply(await engine.coreParameters());
    } catch {
      // Empty choices refuse a start before secrets reach the long operation.
      for (const group of this.#panel.querySelectorAll<HTMLElement>("[data-mhfe-repair-choices]"))
        group.textContent =
          "MHFE parameters could not be loaded. Reload the page before continuing.";
    }
  }

  apply(parameters: MhfeParameters): void {
    for (const input of this.#panel.querySelectorAll<HTMLInputElement>('input[id$="-pim"]'))
      input.max = String(parameters.maxPim);
    for (const group of this.#panel.querySelectorAll<HTMLElement>("[data-mhfe-repair-choices]")) {
      const name = group.dataset.mhfeRepairChoices!;
      const counts: number[] = [...parameters.repairWordCounts].sort(
        (a, b) =>
          Number(b === parameters.recommendedRepairWords) -
            Number(a === parameters.recommendedRepairWords) || a - b,
      );
      if (group.dataset.mhfeAllowNone !== undefined) counts.push(0);
      group.replaceChildren(...counts.map((count) => this.#choice(name, count, parameters)));
    }
    const recommended = parameters.repairCapacities.find(
      (item) => item.count === parameters.recommendedRepairWords,
    );
    for (const note of this.#panel.querySelectorAll<HTMLElement>("[data-mhfe-repair-help]"))
      note.textContent =
        recommended === undefined
          ? ""
          : `${recommended.count} repair words are recommended: they repair ${recommended.unreadable} unreadable or ${recommended.wrong} wrong words.`;
  }

  #choice(name: string, count: number, parameters: MhfeParameters): HTMLLabelElement {
    const label = document.createElement("label");
    label.className = "checkbox-row";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.id = `${name}-${count === 0 ? "none" : count}`;
    input.value = String(count);
    input.autocomplete = "off";
    input.checked = count === parameters.recommendedRepairWords;
    label.htmlFor = input.id;
    const recommended = input.checked ? " (recommended)" : "";
    label.append(input, count === 0 ? "No repair words" : `${count} repair words${recommended}`);
    const capacity = parameters.repairCapacities.find((item) => item.count === count);
    const note = document.createElement("span");
    note.className = "answer-note";
    note.textContent =
      capacity === undefined
        ? "nothing to keep apart"
        : `${capacity.unreadable} unreadable or ${capacity.wrong} wrong words`;
    label.append(note);
    return label;
  }
}
