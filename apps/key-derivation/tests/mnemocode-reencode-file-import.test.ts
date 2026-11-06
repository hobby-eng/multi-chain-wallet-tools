import { afterEach, expect, it, vi } from "vitest";
import { RecoveryFeatureFixture } from "@ckd/test-support/recovery-feature.js";
import { MnemoCodeReEncodeTab } from "../src/ui/recovery-mnemocode-reencode.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("offers the CLI final-word file input beside the concealed Re-encode field", async () => {
  const { page, context } = new RecoveryFeatureFixture();
  vi.stubGlobal("MutationObserver", Reflect.get(page.window, "MutationObserver"));
  for (const name of ["mode", "format"]) {
    const help = page.require(`mnemocode-reencode-${name}-help`);
    page.add(`mnemocode-reencode-${name}-popover`, "div", help).className = "recovery-help-popover";
  }
  new MnemoCodeReEncodeTab(context);
  const field = page.require("mnemocode-reencode-last-word");
  const parent = field.parentElement;
  if (parent === null) throw new Error("The native final-word field needs its parent.");
  const position = parent.children.indexOf(field);
  const choice = parent.children[position + 1];
  if (choice === undefined || typeof choice === "string")
    throw new Error("The final-word field needs its file chooser.");
  expect(choice?.classList.contains("file-choice")).toBe(true);
  const input = choice?.querySelector('input[type="file"]');
  expect(input).not.toBeNull();
  if (input === null || input === undefined)
    throw new Error("The final-word file chooser is missing.");
  let error = "";
  Object.assign(field, {
    setCustomValidity: (text: string) => {
      error = text;
    },
    reportValidity: () => true,
  });
  Object.assign(input, {
    files: [new File([" about\r\n"], "public-final-word.txt", { type: "text/plain" })],
  });
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(field.value).toBe("about"));
  expect(error).toBe("");
});
