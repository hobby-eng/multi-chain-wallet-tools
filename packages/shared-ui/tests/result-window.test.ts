import { describe, expect, it } from "vitest";
import { ResultWindow } from "../src/result-window.js";

describe("result DOM windowing", () => {
  it("normalizes navigation to bounded pages", () => {
    expect(new ResultWindow(10_000, 0, 200)).toMatchObject({ start: 0, end: 200, size: 200 });
    expect(new ResultWindow(10_000, 275, 200)).toMatchObject({ start: 200, end: 400, size: 200 });
    expect(new ResultWindow(10_000, 99_999, 200)).toMatchObject({
      start: 9_800,
      end: 10_000,
      size: 200,
    });
  });

  it("keeps advanced pages small and handles empty results", () => {
    expect(new ResultWindow(101, 96, 24)).toMatchObject({ start: 96, end: 101, size: 24 });
    expect(new ResultWindow(0, 100, 0)).toMatchObject({ start: 0, end: 0, size: 1 });
  });

  it("offers the same page sizes to original and child wallets", () => {
    expect(ResultWindow.sizeFor("basic")).toBe(200);
    expect(ResultWindow.sizeFor("advanced")).toBe(24);
  });
});
