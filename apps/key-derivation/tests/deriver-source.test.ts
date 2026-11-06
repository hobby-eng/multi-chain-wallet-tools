import { afterEach, expect, it, vi } from "vitest";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";
import { writeClipboard } from "@ckd/export/clipboard.js";
import { DeriverSource } from "../src/ui/deriver-source.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retires the native source and references even when its visibility callback fails", () => {
  const { view } = new DeriverViewFixture();
  view.mnemonic.value = "synthetic public source fixture";
  view.passphrase.value = "synthetic public passphrase";
  const source = new DeriverSource(view, {
    writeClipboard,
    onVisibility: () => {
      throw new Error("Synthetic native visibility fault");
    },
  });
  const reference = source.reference();
  expect(() => source.wipe()).toThrow("Synthetic native visibility fault");
  expect(reference.read()).toBeNull();
  expect(source.revealed).toBe(false);
  expect(view.mnemonic.value).toBe("");
  expect(view.passphrase.value).toBe("");
});
