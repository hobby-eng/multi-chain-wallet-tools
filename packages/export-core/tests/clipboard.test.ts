import { afterEach, describe, expect, it, vi } from "vitest";
import { writeClipboard } from "../src/clipboard.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clipboard fallback cleanup", () => {
  it("removes and clears the temporary field when the legacy copy call throws", async () => {
    let removed = false;
    const temporary = {
      value: "",
      readOnly: false,
      tabIndex: 0,
      style: {} as CSSStyleDeclaration,
      select: vi.fn(),
      remove: () => {
        removed = true;
      },
    };
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: () => temporary,
      body: { append: vi.fn() },
      execCommand: () => {
        throw new Error("synthetic copy failure");
      },
    });
    await expect(writeClipboard("public test text")).rejects.toMatchObject({
      code: "clipboard.write",
    });
    expect(temporary.value).toBe("");
    expect(removed).toBe(true);
  });
});

it("does not run the legacy clipboard fallback after the request is cancelled", async () => {
  let refuse = (_cause: Error): void => {};
  const pending = new Promise<void>((_resolve, reject) => {
    refuse = reject;
  });
  const temporary = { value: "", style: {}, select() {}, remove() {} };
  const createElement = vi.fn(() => temporary);
  vi.stubGlobal("navigator", { clipboard: { writeText: () => pending } });
  vi.stubGlobal("document", { createElement, body: { append: vi.fn() }, execCommand: () => true });
  const abort = new AbortController();
  const copied = Reflect.apply(writeClipboard, undefined, [
    "synthetic public fixture",
    abort.signal,
  ]);
  abort.abort();
  refuse(new Error("synthetic native refusal"));
  await copied;
  expect(createElement).not.toHaveBeenCalled();
});

it("preserves a leading byte-order mark in the requested clipboard text", async () => {
  const writeText = vi.fn(async (_value: string): Promise<void> => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await writeClipboard("\uFEFFsynthetic public fixture");
  expect(writeText).toHaveBeenCalledExactlyOnceWith("\uFEFFsynthetic public fixture");
});

it("refuses empty text as a rejected coded operation", async () => {
  await expect(writeClipboard("")).rejects.toMatchObject({ code: "clipboard.empty" });
});
