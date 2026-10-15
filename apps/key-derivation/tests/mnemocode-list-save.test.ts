import { afterEach, describe, expect, it, vi } from "vitest";
import { renderCandidateListSave } from "../src/ui/recovery-mnemocode-candidates.js";
import { MnemoCodeDownload } from "../src/ui/recovery-mnemocode-download.js";
import { RecoveryTestPage, RecoveryTestElement } from "./fake-recovery-page.js";

describe("MnemoCode candidate-list save refusal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports a save failure while clearing the list and preventing another save", () => {
    const page = new RecoveryTestPage();
    const target = page.add("synthetic-list", "div");
    const bytes = Uint8Array.of(1, 2, 3);
    vi.spyOn(MnemoCodeDownload, "bytes").mockImplementation(() => {
      throw new Error("Synthetic save refusal.");
    });
    // The only structural assertion is at the DOM seam; the real controller uses these methods.
    renderCandidateListSave(target as unknown as HTMLElement, {
      bytes,
      records: 1,
      encrypted: false,
      description: "Synthetic list",
    });
    const button = target.children.find(
      (child) => child instanceof RecoveryTestElement && child.tagName === "button",
    );
    if (!(button instanceof RecoveryTestElement)) throw new Error("The save control is missing.");
    button.click();
    expect(bytes).toEqual(Uint8Array.of(0, 0, 0));
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("could not be saved");
    expect(button.textContent).not.toContain("Candidate list saved");
  });
});
