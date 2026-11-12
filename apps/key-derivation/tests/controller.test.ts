import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeyDerivationController } from "../src/ui/controller.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { DerivationResultsError } from "@ckd/ui/derivation-results.js";
import type { DerivationWorkerClient } from "../src/workers/derive-client.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { ControllerTestControl as TestControl } from "@ckd/test-support/controller-events.js";
import {
  controllerHarness,
  settle,
  streamHarness,
  streamResult,
  type ResultTestWorker,
} from "./controller-harness.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Key Derivation controller", () => {
  it("wipes the seed and unlocks controls even if completed-worker teardown fails", async () => {
    const seeds: Uint8Array[] = [];
    const { view, form, createWorker } = await streamHarness({
      mnemonicToSeed: (text: string, passphrase?: string) => {
        const seed = mnemonicToSeed(text, passphrase);
        seeds.push(seed);
        return seed;
      },
    });
    view.mnemonic.value = `${"abandon ".repeat(11)}about`;
    createWorker.mockReturnValue({
      ready: async () => undefined,
      derive: async (_adapter, input) => streamResult(input.start),
      terminate: () => {
        throw new Error("Synthetic native teardown fault");
      },
    });
    form.submit();
    await vi.waitFor(() => expect(seeds).toHaveLength(1));
    // The wipe and the unlock follow the derivation's own awaits: wait for them, not for one turn.
    await vi.waitFor(() => expect(seeds[0]?.every((byte) => byte === 0)).toBe(true));
    await vi.waitFor(() => expect(view.showDerivationIdle).toHaveBeenCalledWith(true));
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining("released"));
  });
  it("unlocks a derivation whose native worker cannot be constructed", async () => {
    const { view, form, createWorker } = await streamHarness();
    createWorker.mockImplementationOnce(() => {
      throw new Error("Synthetic worker creation refusal");
    });
    form.submit();
    await settle();
    expect(view.showError).toHaveBeenCalledWith("Derivation failed.");
    expect(view.showError).not.toHaveBeenCalledWith("Synthetic worker creation refusal");
    expect(view.showDerivationIdle).toHaveBeenCalledWith(true);
  });
  it("completes Clear and descendant revocation despite an active-worker teardown fault", async () => {
    const invalidate = vi.fn();
    const reset = vi.fn();
    const { view, form, createWorker } = await streamHarness({
      installBip85Feature: () => ({
        invalidate,
        reset,
        setEnabled: vi.fn(),
        setSecretsVisible: vi.fn(),
      }),
    });
    let finish: ((result: DerivationResult) => void) | undefined;
    const derive = vi.fn<ResultTestWorker["derive"]>((_adapter, input) =>
      input.start === 0
        ? Promise.resolve(streamResult(0))
        : new Promise<DerivationResult>((resolve) => {
            finish = resolve;
          }),
    );
    createWorker.mockReturnValue({
      ready: async () => undefined,
      derive,
      terminate: () => {
        throw new Error("Synthetic teardown refusal");
      },
    });
    form.submit();
    await vi.waitFor(() => expect(derive).toHaveBeenCalledTimes(2));
    view.clearAllButton.click();
    finish?.(streamResult(2));
    await settle();
    expect(view.clearAllInputs).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(view.clearResults).toHaveBeenCalled();
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining("released"));
  });
  it("completes Clear even when an optional address-search owner refuses cleanup", async () => {
    const { view } = await streamHarness({
      addressSearch: {
        invalidate: () => {
          throw new Error("Synthetic optional cleanup fault");
        },
      },
    });
    view.clearAllButton.click();
    await settle();
    expect(view.clearAllInputs).toHaveBeenCalledOnce();
    expect(view.showError).toHaveBeenCalledWith(expect.stringContaining("released"));
  });
});

describe("Key Derivation result ownership", () => {
  it("retains appended real owner state on cancellation and wipes descriptors on Clear all", async () => {
    const { view, form, createWorker } = await streamHarness();
    const first = streamResult(0);
    const next = streamResult(2);
    const descriptors = first.accountDescriptors;
    const derive = vi
      .fn<DerivationWorkerClient["derive"]>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(next);
    const terminate = vi.fn();
    createWorker.mockReturnValue({ ready: async () => undefined, derive, terminate });
    vi.mocked(view.showStatus).mockImplementation((message) => {
      if (message.includes("4 of 6 total results")) view.cancelDerivationButton.click();
    });
    form.submit();
    await vi.waitFor(() => expect(view.showDerivationIdle).toHaveBeenCalled());
    expect(derive).toHaveBeenCalledTimes(2);
    expect(first.rows.map(({ index }) => index)).toEqual([0, 1, 2, 3]);
    expect(descriptors?.privateText).toBe("synthetic private");
    expect(next.accountDescriptors?.privateText).toBe("");
    expect(view.renderCurrent).toHaveBeenLastCalledWith(
      first,
      expect.objectContaining({ selected: new Set([0, 1, 2, 3]) }),
      expect.any(Map),
      "receive",
      expect.any(Object),
      false,
    );
    expect(view.showStatus).toHaveBeenLastCalledWith(
      expect.stringContaining("cancelled after 4 of 6"),
    );
    view.clearAllButton.click();
    expect(first.rows).toEqual([]);
    expect(descriptors?.privateText).toBe("");
    expect(view.showError).not.toHaveBeenCalled();
  });

  it("discards late old batches after a new request without wiping fresh descriptors", async () => {
    const { view, form, createWorker } = await streamHarness();
    const first = streamResult(0);
    const late = streamResult(2);
    const fresh = streamResult(0);
    let finishLate: (result: DerivationResult) => void = () => {
      throw new Error("not started");
    };
    const pending = new Promise<DerivationResult>((resolve) => {
      finishLate = resolve;
    });
    const derive = vi
      .fn<DerivationWorkerClient["derive"]>()
      .mockResolvedValueOnce(first)
      .mockReturnValueOnce(pending);
    const oldWorker = { ready: async () => undefined, derive, terminate: vi.fn() };
    const newWorker = {
      ready: async () => undefined,
      derive: vi.fn(async () => fresh),
      terminate: vi.fn(),
    };
    createWorker.mockReturnValueOnce(oldWorker).mockReturnValueOnce(newWorker);
    form.submit();
    await vi.waitFor(() => expect(derive).toHaveBeenCalledTimes(2));
    view.controls.count.value = "2";
    form.submit();
    await vi.waitFor(() => expect(newWorker.terminate).toHaveBeenCalled());
    expect(first.rows).toEqual([]);
    expect(first.accountDescriptors?.privateText).toBe("");
    finishLate(late);
    await vi.waitFor(() => expect(oldWorker.terminate).toHaveBeenCalled());
    expect(late.rows).toEqual([]);
    expect(late.accountDescriptors?.privateText).toBe("");
    expect(fresh.rows).toHaveLength(2);
    expect(fresh.accountDescriptors?.privateText).toBe("synthetic private");
    expect(view.renderCurrent).toHaveBeenLastCalledWith(
      fresh,
      expect.any(Object),
      expect.any(Map),
      "receive",
      expect.any(Object),
      false,
    );
    view.clearAllButton.click();
    expect(fresh.accountDescriptors?.privateText).toBe("");
    expect(view.showError).not.toHaveBeenCalled();
  });

  it("builds result invariant messages in the UI from their stable code", async () => {
    const { view, form, createWorker } = await streamHarness();
    createWorker.mockReturnValue({
      ready: async () => undefined,
      derive: async () => {
        throw new DerivationResultsError();
      },
      terminate: vi.fn(),
    });
    form.submit();
    await vi.waitFor(() => expect(view.showError).toHaveBeenCalled());
    expect(view.showError).toHaveBeenLastCalledWith(
      "The result branch state was lost during streamed derivation. Derive the wallet again.",
    );
  });
});

describe("Key Derivation readiness and chosen-word generation", () => {
  it("registers once, gates derivation on startup self-test, and handles mode transitions", async () => {
    const chosenWords = {
      onChange: vi.fn(),
      setConditioned: vi.fn(),
      active: vi.fn(() => false),
      generate: vi.fn(),
      setRevealed: vi.fn(),
      clear: vi.fn(),
    };
    const {
      controller,
      view,
      dependencyMocks,
      form,
      createWorker,
      modeBasic,
      modeAdvanced,
      resolveWorkerSelfTest,
    } = controllerHarness({ chosenWords });

    controller.start();
    controller.start();
    form.submit();
    expect(view.showError).toHaveBeenCalledWith(
      expect.stringContaining("self-test has not completed"),
    );
    expect(form.listeners.get("submit")).toBe(1);
    expect(createWorker).toHaveBeenCalledOnce();

    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    expect(view.setCryptoControlsEnabled).toHaveBeenLastCalledWith(true);
    expect(dependencyMocks.runRecoveryBackupSelfTest).toHaveBeenCalledOnce();
    expect(dependencyMocks.setRecoveryControlsEnabled).toHaveBeenNthCalledWith(1, false);
    expect(dependencyMocks.setRecoveryControlsEnabled).toHaveBeenLastCalledWith(true);

    view.toggleSensitiveValues.click();
    expect(view.setRecoverySourceVisibility).toHaveBeenCalledWith(true);
    expect(view.setResultSecretsVisibility).not.toHaveBeenCalled();
    view.toggleResultSecrets.click();
    expect(view.setResultSecretsVisibility).toHaveBeenCalledWith(true);

    modeAdvanced.click();
    modeBasic.click();
    expect(view.updateMode).toHaveBeenNthCalledWith(2, "advanced");
    expect(view.updateMode).toHaveBeenNthCalledWith(3, "basic");
    // The chosen words are part of the phrase and are shown and hidden with it.
    expect(chosenWords.setRevealed).toHaveBeenCalledWith(true);
  });

  it("generates with chosen words only when they are active, and never falls back", async () => {
    const chosenWords = {
      onChange: vi.fn(),
      setConditioned: vi.fn(),
      active: vi.fn(() => true),
      generate: vi.fn(() =>
        Promise.reject(new Error("Chosen word 1 is not an English BIP39 word.")),
      ),
      setRevealed: vi.fn(),
      clear: vi.fn(),
    };
    const { controller, view, dependencies, resolveWorkerSelfTest, generation } = controllerHarness(
      { chosenWords },
    );
    controller.start();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();

    (view.generate12Button as unknown as TestControl).click();
    await settle();
    expect(chosenWords.generate).toHaveBeenCalledWith(12);
    // The refusal stands next to the Generate buttons, not with the derivation's messages.
    expect(generation.error.textContent).toBe("Chosen word 1 is not an English BIP39 word.");
    expect(view.showError).not.toHaveBeenCalledWith("Chosen word 1 is not an English BIP39 word.");
    // A wish that cannot be met is an error, never an ordinary phrase in its place.
    expect(dependencies.generateMnemonic).not.toHaveBeenCalled();

    chosenWords.active.mockReturnValue(false);
    vi.mocked(dependencies.generateMnemonic).mockImplementation(() => {
      throw new Error("ordinary generation fixture");
    });
    (view.generate24Button as unknown as TestControl).click();
    await settle();
    expect(dependencies.generateMnemonic).toHaveBeenCalledWith(24);
    expect(chosenWords.generate).toHaveBeenCalledOnce();
  });

  it("drops an already sampled chosen-word phrase when wishes change before publication (AUD-026-ARC001)", async () => {
    const chosenWords = {
      onChange: vi.fn(),
      setConditioned: vi.fn(),
      active: vi.fn(() => true),
      // Production sampling finishes before this promise is returned.
      generate: vi.fn(() =>
        Promise.resolve(
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        ),
      ),
      setRevealed: vi.fn(),
      clear: vi.fn(),
    };
    const { controller, view, resolveWorkerSelfTest } = controllerHarness({ chosenWords });
    controller.start();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    // The panel itself tells the page of its edits.
    const edited = chosenWords.onChange.mock.calls[0]![0] as () => void;
    (view.generate12Button as unknown as TestControl).click();
    edited();
    await settle();
    expect(view.setGeneratedMnemonic).not.toHaveBeenCalled();
  });
});

describe("Key Derivation generated source publication", () => {
  it("empties the BIP39 passphrase for an ordinary or chosen-word phrase and keeps it for the MHFE check", async () => {
    const publicPhrase =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const chosenWords = {
      onChange: vi.fn(),
      setConditioned: vi.fn(),
      active: vi.fn(() => false),
      generate: vi.fn(async () => publicPhrase),
      request: vi.fn(() => ({
        wordCount: 24,
        chosen: [{ word: "abandon", position: 1 }],
        neverUse: [],
      })),
      setRevealed: vi.fn(),
      clear: vi.fn(),
    };
    const checked = {
      condition: { goal: "passes the check", name: "the check", bits: 16, words: 24 },
      active: vi.fn(() => false),
      generate: vi.fn(async () => publicPhrase),
      cancel: vi.fn(),
      clear: vi.fn(),
      setEnabled: vi.fn(),
      speed: vi.fn(),
      onSpeed: vi.fn(),
    };
    const { controller, view, dependencies, resolveWorkerSelfTest } = controllerHarness({
      chosenWords,
      generateMnemonic: vi.fn(() => publicPhrase),
      installCheckedMnemonicFeature: vi.fn(() => checked),
    });
    const exactPassphrase = "  ＴＲＥＺＯＲ\n";
    (view.passphrase as unknown as TestControl).value = exactPassphrase;
    controller.start();
    (view.generate24Button as unknown as TestControl).click();
    expect(dependencies.generateMnemonic).not.toHaveBeenCalled();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    // A new phrase is a new wallet: an ordinary generation starts it without the old passphrase.
    for (const button of [
      view.generate12Button,
      view.generate15Button,
      view.generate18Button,
      view.generate21Button,
      view.generate24Button,
    ]) {
      (view.passphrase as unknown as TestControl).value = exactPassphrase;
      (button as unknown as TestControl).click();
      await settle();
      expect(view.passphrase.value).toBe("");
    }
    (view.passphrase as unknown as TestControl).value = exactPassphrase;
    chosenWords.active.mockReturnValue(true);
    (view.generate24Button as unknown as TestControl).click();
    await settle();
    expect(chosenWords.generate).toHaveBeenCalledWith(24);
    expect(view.passphrase.value).toBe("");
    // The MHFE wallet check keeps the passphrase its phrase was drawn for, exactly as typed.
    (view.passphrase as unknown as TestControl).value = exactPassphrase;
    checked.active.mockReturnValue(true);
    (view.generate24Button as unknown as TestControl).click();
    await settle();
    expect(checked.generate).toHaveBeenCalledWith(
      24,
      exactPassphrase,
      chosenWords.request(),
      undefined,
      expect.any(Function),
    );
    expect(view.passphrase.value).toBe(exactPassphrase);
  });
});

describe("Key Derivation phrases of TON and of long draws", () => {
  it("reads a TON phrase typed during the startup checks once they pass, and opens its tab", async () => {
    const bitcoin = { id: "bitcoin-bip44", label: "Bitcoin", variantLabel: "BIP44", defaults: {} };
    const telegram = {
      id: "ton",
      label: "TON Telegram wallet",
      variantLabel: "Telegram wallet",
      seedSource: "ton-phrase",
      defaults: {},
    };
    const ton = {
      active: vi.fn(() => false),
      show: vi.fn((phrase: string) => (phrase === "" ? "other" : "ton-only")),
      cancel: vi.fn(),
      clear: vi.fn(),
      setEnabled: vi.fn(),
      messages: {},
      seedFor: vi.fn(),
    };
    const adapters = [bitcoin, telegram];
    const { controller, view, resolveWorkerSelfTest } = controllerHarness({
      coinFamilies: [
        { id: "bitcoin", label: "Bitcoin", adapters: [bitcoin] },
        { id: "ton", label: "TON", adapters: [telegram] },
      ],
      getAdapterFamilyId: (adapter: { id: string }) => (adapter.id === "ton" ? "ton" : "bitcoin"),
      getCoinAdapter: (id: string) => adapters.find((adapter) => adapter.id === id),
      installTonPhraseFeature: vi.fn(() => ton),
    });
    controller.start();
    (view.mnemonic as unknown as TestControl).value = "a TON phrase";
    view.mnemonic.dispatchEvent(new Event("input"));
    // Before the checks pass, no note and no switch.
    expect(ton.show).toHaveBeenLastCalledWith("");
    expect(view.configureControls).not.toHaveBeenCalledWith(telegram, expect.anything());
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    expect(ton.show).toHaveBeenLastCalledWith("a TON phrase");
    expect(view.configureControls).toHaveBeenLastCalledWith(telegram, expect.anything());
  });

  it("keeps a checked draw when a derivation control changes, and shows its phrase (AUD-026-API001)", async () => {
    const PHRASE = `${"abandon ".repeat(23)}art`;
    let release!: (phrase: string) => void;
    const draw = new Promise<string>((resolve) => {
      release = resolve;
    });
    const checked = {
      condition: { goal: "passes the check", name: "the check", bits: 16, words: 24 },
      active: vi.fn(() => true),
      generate: vi.fn(() => draw),
      cancel: vi.fn(),
      clear: vi.fn(),
      setEnabled: vi.fn(),
      speed: vi.fn(),
      onSpeed: vi.fn(),
    };
    const { controller, view, resolveWorkerSelfTest, generation } = controllerHarness({
      installCheckedMnemonicFeature: vi.fn(() => checked),
    });
    controller.start();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    (view.passphrase as unknown as TestControl).value = "TREZOR";
    (view.generate24Button as unknown as TestControl).click();
    await settle();
    expect(checked.generate).toHaveBeenCalledOnce();
    expect(generation.line.textContent).toMatch(
      /^Drawing a new 24-word phrase that passes the check/u,
    );
    checked.cancel.mockClear();
    // A long draw may outlive a change of what is derived: it goes on, and its phrase is shown
    // and derived with the new settings, never dropped silently.
    (view.controls.count as unknown as TestControl).dispatchEvent(new Event("change"));
    await settle();
    expect(checked.cancel).not.toHaveBeenCalled();
    release(PHRASE);
    await settle();
    expect(view.setGeneratedMnemonic).toHaveBeenCalledWith(PHRASE, undefined);
    expect(generation.line.textContent).toMatch(/^Generated a new 24-word BIP39 recovery phrase/u);
  });

  it("offers a phrase made with chosen words to the backup tabs (AUD-019-UI001)", async () => {
    const PHRASE =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const chosenWords = {
      onChange: vi.fn(),
      setConditioned: vi.fn(),
      active: vi.fn(() => true),
      generate: vi.fn(() => Promise.resolve(PHRASE)),
      setRevealed: vi.fn(),
      clear: vi.fn(),
    };
    const offerRecoverySource =
      vi.fn<
        NonNullable<Parameters<typeof createKeyDerivationController>[1]["offerRecoverySource"]>
      >();
    const { controller, view, resolveWorkerSelfTest } = controllerHarness({
      chosenWords,
      offerRecoverySource,
      openRecoverySource: vi.fn(),
    });
    vi.mocked(view.setGeneratedMnemonic).mockImplementation((phrase: string) => {
      (view.mnemonic as unknown as TestControl).value = phrase;
    });
    controller.start();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    // The field starts empty, so nothing is offered.
    expect(offerRecoverySource).toHaveBeenLastCalledWith(null);

    (view.generate12Button as unknown as TestControl).click();
    await settle();
    expect(view.setGeneratedMnemonic).toHaveBeenCalledWith(PHRASE, undefined);
    const offered = offerRecoverySource.mock.lastCall?.[0];
    expect(offered).not.toBeNull();
    expect(offered?.read()).toEqual({ mnemonic: PHRASE, passphrase: "" });
  });
});

describe("Key Derivation descendant revocation", () => {
  it("drops the BIP85 child whenever the parent changes or is cleared (AUD-022-SEC001)", async () => {
    const PHRASE =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const bip85Feature = {
      derive: vi.fn(() => Promise.resolve()),
      scheduleRefresh: vi.fn(),
      childSource: vi.fn(() => ({ adapter: null, controls: null, mnemonic: null, passphrase: "" })),
      sourceReference: vi.fn(() => null),
      setSecretsVisible: vi.fn(),
      invalidate: vi.fn(),
      reset: vi.fn(),
      setEnabled: vi.fn(),
    };
    const chosenWords = {
      onChange: vi.fn(),
      setConditioned: vi.fn(),
      active: vi.fn(() => false),
      generate: vi.fn(),
      setRevealed: vi.fn(),
      clear: vi.fn(),
    };
    const { controller, view, dependencies, resolveWorkerSelfTest } = controllerHarness({
      chosenWords,
      installBip85Feature: vi.fn(() => bip85Feature),
    });
    controller.start();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    expect(bip85Feature.invalidate).not.toHaveBeenCalled();

    (view.mnemonic as unknown as TestControl).dispatchEvent(new Event("input"));
    expect(bip85Feature.invalidate).toHaveBeenCalledTimes(1);
    (view.passphrase as unknown as TestControl).dispatchEvent(new Event("input"));
    expect(bip85Feature.invalidate).toHaveBeenCalledTimes(2);

    // Generate writes the parent without an input event.
    vi.mocked(dependencies.generateMnemonic).mockReturnValue(PHRASE);
    (view.generate12Button as unknown as TestControl).click();
    await settle();
    expect(view.setGeneratedMnemonic).toHaveBeenCalledWith(PHRASE, undefined);
    expect(bip85Feature.invalidate).toHaveBeenCalledTimes(3);

    expect(bip85Feature.reset).not.toHaveBeenCalled();
    (view.clearAllButton as unknown as TestControl).click();
    expect(bip85Feature.reset).toHaveBeenCalledOnce();
  });

  it("keeps BIP85 and Silent Payments closed after a failed startup or full self-test (AUD-023-SEC001)", async () => {
    const feature = () => ({
      derive: vi.fn(() => Promise.resolve()),
      scheduleRefresh: vi.fn(),
      cancelScheduledRefresh: vi.fn(),
      childSource: vi.fn(() => ({ adapter: null, controls: null, mnemonic: null, passphrase: "" })),
      sourceReference: vi.fn(() => null),
      setSecretsVisible: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      reset: vi.fn(),
      setEnabled: vi.fn(),
    });
    const bip85Feature = feature();
    const silentPaymentFeature = feature();
    let failFullSelfTest: ((cause: unknown) => void) | undefined;

    const failed = controllerHarness({
      installBip85Feature: vi.fn(() => bip85Feature),
      installSilentPaymentFeature: vi.fn(() => silentPaymentFeature),
    });
    failed.controller.start();
    failed.resolveWorkerSelfTest({ passed: false, checks: [], durationMs: 1 });
    await settle();
    expect(bip85Feature.setEnabled).toHaveBeenLastCalledWith(false);
    expect(silentPaymentFeature.setEnabled).toHaveBeenLastCalledWith(false);
    expect(bip85Feature.setEnabled).not.toHaveBeenCalledWith(true);
    vi.unstubAllGlobals();

    const passed = controllerHarness({
      installBip85Feature: vi.fn(() => bip85Feature),
      installSilentPaymentFeature: vi.fn(() => silentPaymentFeature),
      onFullSelfTestFailure: (listener: (cause: unknown) => void) => {
        failFullSelfTest = listener;
      },
    });
    passed.controller.start();
    passed.resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    expect(bip85Feature.setEnabled).toHaveBeenLastCalledWith(true);
    expect(silentPaymentFeature.setEnabled).toHaveBeenLastCalledWith(true);

    failFullSelfTest?.(new Error("A known answer differs."));
    expect(bip85Feature.setEnabled).toHaveBeenLastCalledWith(false);
    expect(silentPaymentFeature.setEnabled).toHaveBeenLastCalledWith(false);
    expect(passed.view.showCryptoSelfTestFailed).toHaveBeenCalled();
    expect(passed.view.setCryptoControlsEnabled).toHaveBeenLastCalledWith(false);
  });
});
