import { afterEach, describe, expect, it, vi } from "vitest";
import type { MhfeParameters } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { MhfePanelParameters } from "../src/ui/recovery-mhfe-parameters.js";
import { FakeElement, installPage, settle } from "./fake-mhfe-page.js";

describe("MHFE controls read the library's parameters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders changed limits and capacities without a copied radio list", () => {
    installPage();
    const pim = new FakeElement();
    const withNone = new FakeElement();
    withNone.dataset.mhfeRepairChoices = "synthetic-repair";
    withNone.dataset.mhfeAllowNone = "";
    const required = new FakeElement();
    required.dataset.mhfeRepairChoices = "required-repair";
    const help = new FakeElement();
    const panel = {
      querySelectorAll: (selector: string) =>
        selector === 'input[id$="-pim"]'
          ? [pim]
          : selector === "[data-mhfe-repair-choices]"
            ? [withNone, required]
            : [help],
    };
    const owner = new MhfePanelParameters(
      panel as unknown as HTMLElement,
      { whenPassed: () => undefined } as unknown as MhfeEngine,
    );
    owner.apply({
      maxPim: 7,
      repairWordCounts: [2, 6],
      recommendedRepairWords: 6,
      repairCapacities: [
        { count: 2, unreadable: 1, wrong: 0 },
        { count: 6, unreadable: 5, wrong: 2 },
      ],
    } as MhfeParameters);
    expect((pim as unknown as HTMLInputElement).max).toBe("7");
    const radios = (group: FakeElement) =>
      group.children.map((label) => (label as FakeElement).children[0] as FakeElement);
    expect(radios(withNone).map((radio) => radio.value)).toEqual(["6", "2", "0"]);
    expect(radios(required).map((radio) => radio.value)).toEqual(["6", "2"]);
    expect(radios(required).map((radio) => radio.checked)).toEqual([true, false]);
    expect(help.textContent).toContain("6 repair words are recommended");
    expect(help.textContent).toContain("5 unreadable or 2 wrong words");
  });

  it("leaves no admissible repair choices when the package cannot supply its parameters", async () => {
    installPage();
    const group = new FakeElement();
    let passed!: () => void;
    new MhfePanelParameters(
      { querySelectorAll: () => [group] } as unknown as HTMLElement,
      {
        whenPassed: (listener: () => void) => {
          passed = listener;
        },
        coreParameters: async () => {
          throw new Error("synthetic metadata failure");
        },
      } as unknown as MhfeEngine,
    );
    passed();
    await settle();
    expect(group.textContent).toContain("parameters could not be loaded");
    expect(group.children).toHaveLength(0);
  });
});
