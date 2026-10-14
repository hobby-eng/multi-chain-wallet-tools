import { describe, expect, it, vi } from "vitest";
import { InputRevision } from "../src/ui/recovery-input-revision.js";

class SyntheticPanel extends EventTarget {
  interaction: string | undefined;
  closest(selector: string): unknown {
    return this.interaction === selector ? this : null;
  }
}

describe("input revisions around interactive recovery results", () => {
  it("keeps the original request when answering its question or checking its recovered result", () => {
    const panel = new SyntheticPanel();
    const edited = vi.fn();
    const revision = new InputRevision(panel, edited);
    const current = revision.capture();
    for (const interaction of ["[data-job-question]", "[data-result-interaction]"]) {
      panel.interaction = interaction;
      panel.dispatchEvent(new Event("input"));
      panel.dispatchEvent(new Event("change"));
      expect(current()).toBe(true);
    }
    expect(edited).not.toHaveBeenCalled();
    panel.interaction = undefined;
    panel.dispatchEvent(new Event("input"));
    expect(current()).toBe(false);
    expect(edited).toHaveBeenCalledTimes(1);
  });

  it("revokes older captures when another job or an explicit clear starts", () => {
    const revision = new InputRevision(new EventTarget(), () => undefined);
    const old = revision.capture();
    const newer = revision.capture();
    expect(old()).toBe(false);
    expect(newer()).toBe(true);
    revision.revise();
    expect(newer()).toBe(false);
  });

  it("binds external date fields to the same capture without treating result interactions as edits", () => {
    const dates = new SyntheticPanel();
    const edited = vi.fn();
    const revision = new InputRevision(new SyntheticPanel(), edited);
    revision.watch(dates);
    const current = revision.capture();
    dates.interaction = "[data-result-interaction]";
    dates.dispatchEvent(new Event("change"));
    expect(current()).toBe(true);
    dates.interaction = undefined;
    dates.dispatchEvent(new Event("input"));
    expect(current()).toBe(false);
    expect(edited).toHaveBeenCalledOnce();
  });

  it("ignores a text field's repeated change, but not new text, a checkbox or a select", () => {
    const panel = new EventTarget();
    const edited = vi.fn();
    const revision = new InputRevision(panel, edited);
    const textarea = { tagName: "TEXTAREA", value: "" };
    const send = (type: string, target: object): void => {
      const event = new Event(type);
      Object.defineProperty(event, "target", { value: target });
      panel.dispatchEvent(event);
    };
    textarea.value = "typed codes";
    send("input", textarea);
    const current = revision.capture();
    // Firefox delivers the textarea's blur change after the click that started the job.
    send("change", textarea);
    expect(current()).toBe(true);
    // The page replacing the text with change alone is an edit.
    textarea.value = "repaired codes";
    send("change", textarea);
    expect(current()).toBe(false);
    for (const target of [
      { tagName: "INPUT", type: "checkbox", value: "on" },
      { tagName: "INPUT", type: "radio", value: "codes" },
      { tagName: "SELECT", value: "direct" },
    ]) {
      const later = revision.capture();
      send("change", target);
      send("change", target);
      expect(later()).toBe(false);
    }
    expect(edited).toHaveBeenCalledTimes(8);
  });
});
