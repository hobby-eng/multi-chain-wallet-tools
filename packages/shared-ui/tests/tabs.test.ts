import { describe, expect, it } from "vitest";
import { isTabKey, tabIndexAfter } from "../src/tabs.js";

// The keys of a tab list (WAI-ARIA tabs pattern), the one rule every tool's tabs follow.

describe("the keys of a tab list", () => {
  it("moves to the neighbour, wrapping round, and to the ends", () => {
    expect(tabIndexAfter("ArrowRight", 0, 3)).toBe(1);
    expect(tabIndexAfter("ArrowRight", 2, 3)).toBe(0);
    expect(tabIndexAfter("ArrowLeft", 0, 3)).toBe(2);
    expect(tabIndexAfter("Home", 2, 3)).toBe(0);
    expect(tabIndexAfter("End", 0, 3)).toBe(2);
  });

  it("ignores other keys and an empty list", () => {
    expect(isTabKey("Enter")).toBe(false);
    expect(tabIndexAfter("Enter", 0, 3)).toBeUndefined();
    expect(tabIndexAfter("ArrowRight", 0, 0)).toBeUndefined();
  });
});
