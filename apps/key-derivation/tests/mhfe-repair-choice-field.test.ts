import { afterEach, describe, expect, it, vi } from "vitest";
import { selectedRepairCount } from "../src/ui/recovery-mhfe-fields.js";
import type { MhfeRepairWordCount } from "@ckd/recovery-backup/mhfe-repair-choices.js";

const parameters = { repairWordCounts: [2, 6] satisfies MhfeRepairWordCount[] };
afterEach(() => vi.unstubAllGlobals());
describe("the repair radio reader delegates to the producer's choices", () => {
  it.each([undefined, "", "3", "02", "2junk"])(
    "refuses an absent or malformed native selection: case %#",
    (value) => {
      vi.stubGlobal("document", { querySelector: () => (value === undefined ? null : { value }) });
      expect(() => selectedRepairCount("synthetic", parameters)).toThrow(
        expect.objectContaining({ code: "mhfe.repair.choice" }),
      );
    },
  );
  it("keeps none explicit and requires a positive count for making repair words", () => {
    vi.stubGlobal("document", { querySelector: () => ({ value: "0" }) });
    expect(selectedRepairCount("synthetic", parameters)).toBe(0);
    expect(() => selectedRepairCount("synthetic", parameters, "required")).toThrow(
      expect.objectContaining({ code: "mhfe.repair.choice" }),
    );
    vi.stubGlobal("document", { querySelector: () => ({ value: "6" }) });
    expect(selectedRepairCount("synthetic", parameters, "required")).toBe(6);
  });
});
