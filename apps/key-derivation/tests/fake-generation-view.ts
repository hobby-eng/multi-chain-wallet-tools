// The lines of a draw under the Generate buttons and the outlook under the generation options, on
// passive elements, for the controller fixtures whose views are stubs. The views are the real ones.
import { vi } from "vitest";
import { GenerationOutlook } from "../src/ui/generation-outlook.js";
import { GenerationProgress } from "../src/ui/generation-progress.js";

/** A passive element: text, visibility, classes and clicks, without layout. */
export class GenerationLine extends EventTarget {
  hidden = true;
  textContent = "";
  readonly classList = { toggle: vi.fn() };
  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

/** The generation views of a stub view, and their elements for the tests to read. */
export function generationViews() {
  const progress = {
    line: new GenerationLine(),
    count: new GenerationLine(),
    stop: new GenerationLine(),
    error: new GenerationLine(),
  };
  const outlook = {
    box: new GenerationLine(),
    bits: new GenerationLine(),
    time: new GenerationLine(),
    note: new GenerationLine(),
  };
  return {
    generationProgress: new GenerationProgress(
      progress as unknown as ConstructorParameters<typeof GenerationProgress>[0],
    ),
    generationOutlook: new GenerationOutlook(
      outlook as unknown as ConstructorParameters<typeof GenerationOutlook>[0],
    ),
    progress,
    outlook,
  };
}
