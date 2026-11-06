import { describe, expect, it } from "vitest";
import { ResultSelection } from "../src/result-selection.js";

describe("result selection", () => {
  const indexes = [4, 7, 12];

  it("selects all and none without assuming contiguous indexes", () => {
    expect([...ResultSelection.choose("all", indexes)]).toEqual(indexes);
    expect([...ResultSelection.choose("none", indexes)]).toEqual([]);
  });

  it("inverts only known indexes and leaves borrowed input intact", () => {
    const selected = new Set([7, 99]);
    expect([...ResultSelection.choose("invert", indexes, selected)]).toEqual([4, 12]);
    expect([...selected]).toEqual([7, 99]);
    expect(indexes).toEqual([4, 7, 12]);
  });
});
