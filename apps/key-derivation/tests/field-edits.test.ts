import { describe, expect, it } from "vitest";
import { FieldEdits } from "../src/ui/field-edits.js";

/** An event from `target`, as a browser delivers it to a listener on an ancestor. */
function from(type: string, target: object): Event {
  const event = new Event(type);
  Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("field edits", () => {
  it("counts a text field's change only when its text differs from the last counted edit", () => {
    const edits = new FieldEdits();
    const field = { tagName: "TEXTAREA", value: "typed" };
    expect(edits.isNew(from("input", field))).toBe(true);
    // Firefox's change after the click that started a job carries the same text.
    expect(edits.isNew(from("change", field))).toBe(false);
    field.value = "set by the page";
    expect(edits.isNew(from("change", field))).toBe(true);
    expect(edits.isNew(from("change", field))).toBe(false);
  });

  it("treats text-like inputs as text and keeps every change of other controls", () => {
    const edits = new FieldEdits();
    for (const type of ["text", "password", "number", undefined]) {
      const input = { tagName: "INPUT", type, value: "5" };
      expect(edits.isNew(from("input", input))).toBe(true);
      expect(edits.isNew(from("change", input))).toBe(false);
    }
    for (const control of [
      { tagName: "INPUT", type: "checkbox", value: "on" },
      { tagName: "INPUT", type: "radio", value: "a" },
      { tagName: "SELECT", value: "b" },
      new EventTarget(),
    ]) {
      expect(edits.isNew(from("change", control))).toBe(true);
      expect(edits.isNew(from("change", control))).toBe(true);
    }
  });
});
