import { afterEach, expect, it, vi } from "vitest";
import { installControllerFixture } from "./fake-deriver-controller.js";
import { RecoveryTestPage, settlePromises } from "./fake-recovery-page.js";
import { writeClipboard } from "@ckd/export/clipboard.js";
import { ChosenWordPage } from "@ckd/test-support/chosen-word-page.js";
import { installChosenWordsFeature } from "../src/ui/chosen-words-feature.js";
import type { RecoverySourceReference } from "../src/ui/recovery-source-link.js";

// This controller contract fixture stubs startup/derivation, which these clipboard cases never
// assess. Only the injected native clipboard edge is delayed; the actual controller handles it.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function fixture(
  withChosenWords = false,
  offer?: (reference: RecoverySourceReference | null) => void,
) {
  vi.useFakeTimers();
  // The chosen words' hints follow Show and Hide through the browser's observer, not under test.
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe(): void {}
    },
  );
  const page = withChosenWords ? new ChosenWordPage() : new RecoveryTestPage();
  let chosenWords;
  if (page instanceof ChosenWordPage) {
    for (const name of [
      "enabled",
      "panel",
      "fields",
      "strength",
      "bar-fill",
      "bits",
      "verdict",
      "rule",
    ])
      page.add(`chosen-words-${name}`, name === "enabled" ? "input" : "div");
    chosenWords = installChosenWordsFeature(page.asDocument());
    page.require("chosen-words-enabled").checked = true;
    page.require("chosen-words-never").value = "zoo";
  }
  const main = installControllerFixture(
    page,
    {
      otherPhrase: PHRASE,
      seedBytes: 64,
      seedMarker: 1,
      otherSeedMarker: 2,
    },
    [],
    false,
    chosenWords,
    offer,
  );
  main.viewElements.mnemonic!.value = PHRASE;
  main.viewElements.toggleSensitiveValues!.click();
  return {
    ...main,
    status: vi.spyOn(main.view, "showStatus"),
    flash: vi.spyOn(main.view, "flashCopied"),
    error: vi.spyOn(main.view, "showError"),
  };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(["clear", "conceal", "edit", "pagehide", "generate"] as const)(
  "does not announce an obsolete source copy after %s",
  async (kind) => {
    const f = fixture();
    await settlePromises();
    let finish = (): void => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const write = vi.mocked(f.dependencies.writeClipboard).mockReturnValueOnce(pending);
    f.viewElements.copyMnemonicButton!.click();
    expect(write).toHaveBeenCalledOnce();
    if (kind === "clear") f.viewElements.clearAllButton!.click();
    else if (kind === "conceal") f.viewElements.toggleSensitiveValues!.click();
    else if (kind === "edit") {
      f.viewElements.mnemonic!.value = "synthetic replacement";
      f.viewElements.mnemonic!.dispatchEvent(new Event("input"));
    } else if (kind === "generate") f.viewElements.generate12Button!.click();
    else f.page.window.dispatchEvent(new Event("pagehide"));
    // Let the replacement operation publish its own status before completing the obsolete copy.
    await settlePromises();
    f.status.mockClear();
    f.flash.mockClear();
    finish();
    await settlePromises();
    expect(f.flash).not.toHaveBeenCalled();
    expect(f.status).not.toHaveBeenCalled();
  },
);

it("keeps supplied native clipboard failures out of source-copy diagnostics", async () => {
  const f = fixture();
  const marker = "synthetic private error marker";
  vi.mocked(f.dependencies.writeClipboard).mockRejectedValueOnce(new Error(marker));
  f.viewElements.copyMnemonicButton!.click();
  await settlePromises();
  expect(f.error).toHaveBeenCalledOnce();
  expect(f.error.mock.calls.flat().join(" ")).not.toContain(marker);
});

it("copies the exact shown phrase and refuses an undisclosed source", async () => {
  const f = fixture();
  f.viewElements.toggleSensitiveValues!.click();
  f.viewElements.copyMnemonicButton!.click();
  expect(f.dependencies.writeClipboard).not.toHaveBeenCalled();
  f.viewElements.toggleSensitiveValues!.click();
  f.viewElements.copyMnemonicButton!.click();
  await settlePromises();
  expect(vi.mocked(f.dependencies.writeClipboard).mock.calls[0]?.[0]).toBe(PHRASE);
  expect(f.flash).toHaveBeenCalledOnce();
});

it("does not start the native legacy fallback after source Clear", async () => {
  const f = fixture();
  let refuse = (): void => {};
  const pending = new Promise<void>((_resolve, reject) => {
    refuse = () => reject(new Error("Synthetic native denial"));
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: () => pending } });
  vi.mocked(f.dependencies.writeClipboard).mockImplementation(writeClipboard);
  const create = vi.spyOn(f.page, "createElement");
  f.viewElements.copyMnemonicButton!.click();
  f.viewElements.clearAllButton!.click();
  create.mockClear();
  refuse();
  await settlePromises();
  expect(create).not.toHaveBeenCalledWith("textarea");
  expect(f.flash).not.toHaveBeenCalled();
});

function deterministicNativeRandom(): void {
  vi.spyOn(crypto, "getRandomValues").mockImplementation(
    <T extends ArrayBufferView>(bytes: T): T => {
      new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).fill(0xaa);
      return bytes;
    },
  );
}

it.each(["resolve", "reject"] as const)(
  "retires a copy started during generation before late native %s",
  async (completion) => {
    const f = fixture(true);
    await settlePromises();
    deterministicNativeRandom();
    let finish = (): void => {};
    const pending = new Promise<void>((resolve, reject) => {
      finish =
        completion === "resolve" ? resolve : () => reject(new Error("Synthetic native denial"));
    });
    const nativeWrite = vi.fn(() => pending);
    vi.stubGlobal("navigator", { clipboard: { writeText: nativeWrite } });
    vi.mocked(f.dependencies.writeClipboard).mockImplementation(writeClipboard);
    f.viewElements.generate12Button!.click();
    f.viewElements.copyMnemonicButton!.click();
    expect(nativeWrite).toHaveBeenCalledExactlyOnceWith(PHRASE);
    await settlePromises();
    expect(f.viewElements.mnemonic!.value).not.toBe(PHRASE);
    f.status.mockClear();
    f.flash.mockClear();
    const create = vi.spyOn(f.page, "createElement");
    finish();
    await settlePromises();
    expect(create).not.toHaveBeenCalledWith("textarea");
    expect(f.flash).not.toHaveBeenCalled();
    expect(f.status).not.toHaveBeenCalled();
  },
);

it("revokes a source reference offered during generation before a new phrase is published", async () => {
  const offers: RecoverySourceReference[] = [];
  const f = fixture(true, (reference) => {
    if (reference !== null) offers.push(reference);
  });
  await settlePromises();
  deterministicNativeRandom();
  f.viewElements.generate12Button!.click();
  await settlePromises();
  expect(offers).toHaveLength(2);
  expect(offers[1]?.read()?.mnemonic).toBe(f.viewElements.mnemonic!.value);
  expect(offers[0]?.read()).toBeNull();
});

it("retires native source fields and outstanding references when the page ends", async () => {
  const offers: RecoverySourceReference[] = [];
  const f = fixture(false, (reference) => {
    if (reference !== null) offers.push(reference);
  });
  f.viewElements.mnemonic!.dispatchEvent(new Event("input"));
  await settlePromises();
  const reference = offers.at(-1);
  if (reference === undefined) throw new Error("The typed public fixture must be offered.");
  f.page.window.dispatchEvent(new Event("pagehide"));
  expect(reference.read()).toBeNull();
  expect(f.viewElements.mnemonic!.value).toBe("");
  expect(f.viewElements.passphrase!.value).toBe("");
});
