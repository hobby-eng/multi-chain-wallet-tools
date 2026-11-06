import { describe, expect, it } from "vitest";
import { MhfeRepairChoices, type MhfeRepairWordCount } from "../src/mhfe-repair-choices.js";

describe("MHFE repair choices follow the producer's parameters", () => {
  const counts: MhfeRepairWordCount[] = [2, 6];
  it("accepts only the supplied choices and snapshots their data", () => {
    const supplied = { repairWordCounts: [...counts] };
    const choices = new MhfeRepairChoices(supplied);
    supplied.repairWordCounts.push(4);
    expect(choices.required("2")).toBe(2);
    expect(choices.required(6)).toBe(6);
    expect(choices.optional("0")).toBe(0);
    expect(choices.optional(0)).toBe(0);
    expect(() => choices.required(0)).toThrow(
      expect.objectContaining({ code: "mhfe.repair.choice" }),
    );
    expect(() => choices.required(4)).toThrow(
      expect.objectContaining({ code: "mhfe.repair.choice" }),
    );
  });
  it.each([undefined, null, "", "02", "2junk", -1, 3, Number.NaN, {}, []])(
    "refuses an absent or unsupported choice without coercion: case %#",
    (value) => {
      const choices = new MhfeRepairChoices({ repairWordCounts: counts });
      expect(() => choices.optional(value)).toThrow(
        expect.objectContaining({ code: "mhfe.repair.choice" }),
      );
    },
  );
});
