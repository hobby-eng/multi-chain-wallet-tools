import { expect, it } from "vitest";
import { ClipboardSelection } from "../src/clipboard-selection.js";

it("admits zero through the existing 200,000-value clipboard boundary", () => {
  expect(() => ClipboardSelection.admit(0)).not.toThrow();
  expect(() => ClipboardSelection.admit(200_000)).not.toThrow();
  expect(() => ClipboardSelection.admit(200_001)).toThrow(
    expect.objectContaining({ code: "export.clipboard.limit" }),
  );
});
it.each([-1, 1.5, NaN, Infinity])("refuses the invalid value count %s", (count) => {
  expect(() => ClipboardSelection.admit(count)).toThrow(
    expect.objectContaining({ code: "export.clipboard.count" }),
  );
});
