import { afterEach, expect, it, vi } from "vitest";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { MnemonicDiagnosticFeature } from "../src/ui/mnemonic-diagnostic-feature.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(revealed = false, ready = true) {
  const native = new DeriverViewFixture();
  const seeds: Uint8Array[] = [];
  const options = {
    view: native.view,
    mnemonic: native.view.mnemonic,
    passphrase: native.view.passphrase,
    sourceRevealed: () => revealed,
    cryptoReady: () => ready,
    mnemonicToSeed: (...args: Parameters<typeof mnemonicToSeed>) => {
      const seed = mnemonicToSeed(...args);
      seeds.push(seed);
      return seed;
    },
  };
  const feature = new MnemonicDiagnosticFeature(options);
  return { view: native.view, page: native.page, seeds, feature };
}

it.each([12, 15, 18, 21, 24])(
  "recognizes %i-word readiness without claiming a valid checksum",
  (count) => {
    const { view, feature } = fixture();
    view.mnemonic.value = "abandon ".repeat(count);
    expect(feature.mayBeComplete()).toBe(true);
    view.mnemonic.value += "extra";
    expect(feature.mayBeComplete()).toBe(false);
  },
);

it("wipes the actual diagnostic seed when a native rendering edge fails", () => {
  const { page, view, feature, seeds } = fixture(true);
  view.mnemonic.value =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  vi.spyOn(page, "createElement").mockImplementation(() => {
    throw new Error("Synthetic native rendering failure");
  });
  expect(() => feature.update()).toThrow("Synthetic native rendering failure");
  expect(seeds).toHaveLength(1);
  expect(seeds[0]?.length).toBe(64);
  expect(seeds[0]?.every((byte) => byte === 0)).toBe(true);
});

it.each([
  { revealed: false, ready: true },
  { revealed: true, ready: false },
])(
  "does not read a passphrase or derive a diagnostic seed with revealed=$revealed and ready=$ready",
  ({ revealed, ready }) => {
    const { view, feature, seeds } = fixture(revealed, ready);
    view.mnemonic.value =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    let passphraseReads = 0;
    Object.defineProperty(view.passphrase, "value", {
      configurable: true,
      get: () => {
        passphraseReads += 1;
        return "TREZOR";
      },
    });
    feature.update();
    expect(seeds).toHaveLength(0);
    expect(passphraseReads).toBe(0);
  },
);

it("handles an oversized phrase without inventing a zero count or leaving Copy enabled", () => {
  const { page, view, feature, seeds } = fixture(true);
  view.mnemonic.value = " ".repeat(8193);
  view.copyMnemonicButton.disabled = false;
  expect(() => feature.update()).not.toThrow();
  expect(page.require("word-count").textContent).toBe("Word count unavailable");
  expect(view.copyMnemonicButton.disabled).toBe(true);
  expect(() => feature.mayBeComplete()).not.toThrow();
  expect(feature.mayBeComplete()).toBe(false);
  expect(seeds).toHaveLength(0);
});

it("handles oversized native word-count input through the same view boundary", () => {
  const { page, view } = fixture(true);
  view.mnemonic.value = " ".repeat(8193);
  view.copyMnemonicButton.disabled = false;
  expect(() => view.updateWordCount(true)).not.toThrow();
  expect(page.require("word-count").textContent).toBe("Word count unavailable");
  expect(view.copyMnemonicButton.disabled).toBe(true);
});

it("uses the same empty-field count for the actual view after reset", () => {
  const { page, view, feature, seeds } = fixture();
  view.mnemonic.value = " \t\n";
  feature.reset();
  expect(feature.mayBeComplete()).toBe(false);
  expect(page.require("word-count").textContent).toBe("0 words");
  expect(view.copyMnemonicButton.disabled).toBe(true);
  expect(seeds).toHaveLength(0);
});
