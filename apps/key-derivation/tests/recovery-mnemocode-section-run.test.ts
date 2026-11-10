import { afterEach, describe, expect, it, vi } from "vitest";
import { clearWithPage } from "../src/ui/recovery-mnemocode-section-run.js";

function pagePorts() {
  const clear = new EventTarget();
  const page = new EventTarget();
  // Only native event registration is replaced; the production cleanup function runs unchanged.
  vi.stubGlobal("document", {
    querySelector: (selector: string) => (selector === "#clear-all" ? clear : null),
  });
  vi.stubGlobal("window", page);
  return { clear, page };
}

describe("a section's explicit private input cleanup boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("empties registered fields before the Clear callback", () => {
    const { clear } = pagePorts();
    // Native field ports: this boundary reads/writes only their value property.
    const text = { value: "public synthetic text" } as HTMLTextAreaElement;
    const password = { value: "public synthetic password" } as HTMLInputElement;
    const callback = vi.fn(() => {
      expect(text.value).toBe("");
      expect(password.value).toBe("");
    });
    clearWithPage(callback, [text, password]);
    expect(text.value).toBe("public synthetic text");
    clear.dispatchEvent(new Event("click"));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("clears a selected-file field on page departure", () => {
    const { page } = pagePorts();
    // Native file-input port: assigning the empty string is its supported reset operation.
    const file = { value: "public-fixture.jpg" } as HTMLInputElement;
    const callback = vi.fn();
    clearWithPage(callback, [file]);
    page.dispatchEvent(new Event("pagehide"));
    expect(file.value).toBe("");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("preserves ordinary edits until an explicit cleanup boundary", () => {
    const { clear, page } = pagePorts();
    // Native input port with a public value; no production owner is mocked.
    const text = { value: "public in-progress edit" } as HTMLInputElement;
    const callback = vi.fn();
    clearWithPage(callback, [text]);
    clear.dispatchEvent(new Event("input"));
    page.dispatchEvent(new Event("change"));
    expect(text.value).toBe("public in-progress edit");
    expect(callback).not.toHaveBeenCalled();
  });

  it("preserves callers that register only result cleanup", () => {
    const { clear, page } = pagePorts();
    const callback = vi.fn();
    clearWithPage(callback);
    clear.dispatchEvent(new Event("click"));
    page.dispatchEvent(new Event("pagehide"));
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
