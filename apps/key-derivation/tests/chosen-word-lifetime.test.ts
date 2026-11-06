import { afterEach, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { ChosenWordFields } from "../src/ui/chosen-word-fields.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const page = new CompleteIdPage();
  const nativeDocument = page.asDocument();
  Object.assign(page, {
    getElementById: (id: string) => page.body.querySelector(`#${id}`),
  });
  vi.stubGlobal("HTMLButtonElement", class extends EventTarget {});
  // The word hints follow Show and Hide through the browser's observer, not under test here.
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe(): void {}
    },
  );
  vi.stubGlobal("Option", function (text: string, value = text) {
    return Object.assign(nativeDocument.createElement("option"), { textContent: text, value });
  });
  const block = nativeDocument.createElement("div");
  nativeDocument.body.append(block);
  const fields = new ChosenWordFields(block, { prefix: "fixture", words: 1, neverUse: 1 });
  const snapshots = vi.spyOn(SecretValue, "utf16Texts");
  const input = page.require("fixture-word-1");
  input.value = "zoo";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const snapshot: unknown = snapshots.mock.results[0]?.value;
  if (!(snapshot instanceof SecretValue)) throw new Error("The edit needs an owned comparison.");
  return { page, fields, input, snapshot };
}

it.each(["row", "all"] as const)("retires comparison bytes when chosen words clear %s", (kind) => {
  const { page, fields, input, snapshot } = fixture();
  const changed = vi.fn();
  fields.onChange(changed);
  if (kind === "row") page.require("fixture-word-1-clear").click();
  else fields.clear();
  expect(input.value).toBe("");
  expect(fields.hasWishes()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(kind === "row" ? 1 : 0);
  expect(() => snapshot.assertLive()).toThrow(
    expect.objectContaining({ code: "core.secret-value.wiped" }),
  );
});
