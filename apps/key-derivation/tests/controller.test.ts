import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeyDerivationController } from "../src/ui/controller.js";
import type { KeyDerivationView } from "../src/ui/view.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { DerivationResultsError } from "@ckd/ui/derivation-results.js";
import type { DerivationWorkerClient } from "../src/workers/derive-client.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import {
  ControllerTestControl as TestControl,
  ControllerTestForm as TestForm,
} from "@ckd/test-support/controller-events.js";

type ResultTestWorker = Pick<DerivationWorkerClient, "ready" | "derive" | "terminate">;

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function installNativeWindow(): void {
  const windowEvents = new TestControl();
  vi.stubGlobal("window", {
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    setTimeout(callback: () => void): number {
      return globalThis.setTimeout(callback, 0) as unknown as number;
    },
    clearTimeout(id: number): void {
      globalThis.clearTimeout(id);
    },
  });
}

/** A started controller with fake view controls; `extra` adds or replaces dependencies. */
function controllerHarness(extra: Record<string, unknown> = {}) {
  installNativeWindow();
  const document = new TestControl();
  const form = new TestForm();
  const controls = {
    coin: new TestControl(),
    protocolTabs: new TestControl(),
    network: new TestControl(),
    account: new TestControl(),
    branchInput: new TestControl(),
    branchSelect: new TestControl(),
    includeChange: new TestControl(),
    includeCoinJoin: new TestControl(),
    includeLegacyMobile: new TestControl(),
    start: new TestControl(),
    count: new TestControl(),
  };
  const modeBasic = new TestControl();
  const modeAdvanced = new TestControl();
  let resolveWorkerSelfTest!: (value: {
    passed: boolean;
    checks: string[];
    durationMs: number;
  }) => void;
  const workerSelfTest = new Promise<{ passed: boolean; checks: string[]; durationMs: number }>(
    (resolve) => {
      resolveWorkerSelfTest = resolve;
    },
  );
  const startupWorker = {
    selfTest: vi.fn(() => workerSelfTest),
    terminate: vi.fn(),
  };
  const view = {
    document,
    controls,
    form,
    mnemonic: new TestControl(),
    passphrase: new TestControl(),
    exportFormat: new TestControl(),
    modeBasic,
    modeAdvanced,
    resultBranchTabs: new TestControl(),
    resultReceiveTab: new TestControl(),
    resultChangeTab: new TestControl(),
    resultCoinJoinTab: new TestControl(),
    coinJoinBranchTabs: new TestControl(),
    resultCoinJoinExternalTab: new TestControl(),
    resultCoinJoinInternalTab: new TestControl(),
    toggleSensitiveValues: new TestControl(),
    toggleResultSecrets: new TestControl(),
    copyMnemonicButton: new TestControl(),
    descriptorButtons: Object.fromEntries(
      ["scanner", "publicCopy", "publicDownload", "privateCopy", "privateDownload"].map((key) => [
        key,
        new TestControl(),
      ]),
    ),
    copyWatchOnlyButton: new TestControl(),
    downloadWatchOnlyButton: new TestControl(),
    cancelDerivationButton: new TestControl(),
    expectedAddress: new TestControl(),
    searchStart: new TestControl(),
    searchCount: new TestControl(),
    searchAddressButton: new TestControl(),
    generate12Button: new TestControl(),
    generate15Button: new TestControl(),
    generate18Button: new TestControl(),
    generate21Button: new TestControl(),
    generate24Button: new TestControl(),
    clearAllButton: new TestControl(),
    selectAllButton: new TestControl(),
    selectNoneButton: new TestControl(),
    selectInvertButton: new TestControl(),
    showError: vi.fn(),
    showStatus: vi.fn(),
    clearMessages: vi.fn(),
    populateCoinSelect: vi.fn(),
    configureControls: vi.fn(),
    updateWordCount: vi.fn(),
    updateSeedDiagnostic: vi.fn(),
    updateMode: vi.fn(),
    updateBulkActions: vi.fn(),
    populateBuildPassport: vi.fn(),
    setCryptoControlsEnabled: vi.fn(),
    showCryptoSelfTestPassed: vi.fn(),
    showCryptoSelfTestFailed: vi.fn(),
    setRecoverySourceVisibility: vi.fn(),
    setResultSecretsVisibility: vi.fn(),
    resetDeriveAction: vi.fn(),
    hideSearchResult: vi.fn(),
    documentActionFrom: vi.fn(() => null),
    clearResults: vi.fn(),
    setGeneratedMnemonic: vi.fn(),
    clearAllInputs: vi.fn(),
    updatePathPreview: vi.fn(),
    showDerivationRunning: vi.fn(),
    showDerivationIdle: vi.fn(),
    showCancellationRequested: vi.fn(),
    showResults: vi.fn(),
    updateResultBranchTabs: vi.fn(),
    renderCurrent: vi.fn(),
    scrollResultsIntoView: vi.fn(),
  } as unknown as KeyDerivationView;
  const adapter = {
    id: "bitcoin-bip44",
    label: "Bitcoin",
    variantLabel: "BIP44",
    defaults: {},
  };
  // The startup fixture also sends passed:false to exercise rejection of a failed external report.
  const createWorker = vi.fn<() => typeof startupWorker | ResultTestWorker>(() => startupWorker);
  const dependencyMocks = {
    coinFamilies: [{ id: "bitcoin", label: "Bitcoin" }],
    getAdapterFamilyId: () => "bitcoin",
    getCoinAdapter: () => adapter,
    getDefaultCoinAdapter: () => adapter,
    buildInfo: {},
    generateMnemonic: vi.fn(),
    mnemonicToSeed: vi.fn(),
    runBip39SelfTest: () => ({ passed: true, checks: ["fixture"], durationMs: 1 }),
    runRecoveryBackupSelfTest: vi.fn(() => ({ passed: true, checks: [], durationMs: 0 })),
    setRecoveryControlsEnabled: vi.fn(),
    writeClipboard: vi.fn(),
    downloadBlob: vi.fn(),
    downloadText: vi.fn(),
    createWorker,
    ...extra,
  };
  const dependencies = dependencyMocks as unknown as Parameters<
    typeof createKeyDerivationController
  >[1];
  const controller = createKeyDerivationController(view, dependencies);
  return {
    controller,
    view,
    dependencies,
    dependencyMocks,
    form,
    createWorker,
    modeBasic,
    modeAdvanced,
    resolveWorkerSelfTest,
  };
}

function streamResult(start: number): DerivationResult {
  return {
    id: "bitcoin-bip44",
    title: "Synthetic",
    networkLabel: "Mainnet",
    pathTemplate: "m/i",
    basicSummary: [],
    summary: [],
    notices: [],
    accountDescriptors: {
      accountPath: "m/0'",
      publicText: "synthetic public",
      privateText: "synthetic private",
      scannerText: "synthetic scanner",
      fileStem: "synthetic",
    },
    rows: [start, start + 1].map((index) => ({
      index,
      path: `m/${index}`,
      title: "Synthetic row",
      basic: [],
      advanced: [],
    })),
  };
}

async function streamHarness(extra: Record<string, unknown> = {}) {
  const adapter = {
    id: "bitcoin-bip44",
    label: "Bitcoin",
    variantLabel: "BIP44",
    batchSize: 2,
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 6 },
  };
  const harness = controllerHarness({
    mnemonicToSeed: () => new Uint8Array(64).fill(7),
    getDefaultCoinAdapter: () => adapter,
    getCoinAdapter: () => adapter,
    ...extra,
  });
  harness.controller.start();
  harness.resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
  await settle();
  harness.view.controls.network.value = "mainnet";
  harness.view.controls.count.value = "6";
  harness.view.controls.start.value = "0";
  harness.view.controls.account.value = "0";
  return harness;
}

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
      useChecked: vi.fn(),
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
      useChecked: vi.fn(),
      active: vi.fn(() => true),
      generate: vi.fn(() =>
        Promise.reject(new Error("Chosen word 1 is not an English BIP39 word.")),
      ),
      setRevealed: vi.fn(),
      clear: vi.fn(),
    };
    const { controller, view, dependencies, resolveWorkerSelfTest } = controllerHarness({
      chosenWords,
    });
    controller.start();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();

    (view.generate12Button as unknown as TestControl).click();
    await settle();
    expect(chosenWords.generate).toHaveBeenCalledWith(12);
    expect(view.showError).toHaveBeenLastCalledWith("Chosen word 1 is not an English BIP39 word.");
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
      useChecked: vi.fn(),
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
    // No checked mode is installed here: the panel itself tells the page of its edits.
    expect(chosenWords.useChecked).not.toHaveBeenCalled();
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
      useChecked: vi.fn(),
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
      active: vi.fn(() => false),
      generate: vi.fn(async () => publicPhrase),
      cancel: vi.fn(),
      clear: vi.fn(),
      setEnabled: vi.fn(),
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
      expect.any(Function),
    );
    expect(view.passphrase.value).toBe(exactPassphrase);
  });

  it("cancels a checked draw when a derivation control changes (AUD-026-API001)", async () => {
    let fail!: (cause: Error) => void;
    const draw = new Promise<string>((_, reject) => {
      fail = reject;
    });
    const checked = {
      active: vi.fn(() => true),
      generate: vi.fn(() => draw),
      cancel: vi.fn(() => {
        const cause = new Error("Stopped");
        cause.name = "AbortError";
        fail(cause);
      }),
      clear: vi.fn(),
      setEnabled: vi.fn(),
    };
    const { controller, view, resolveWorkerSelfTest } = controllerHarness({
      installCheckedMnemonicFeature: vi.fn(() => checked),
    });
    controller.start();
    resolveWorkerSelfTest({ passed: true, checks: ["worker fixture"], durationMs: 1 });
    await settle();
    (view.generate24Button as unknown as TestControl).click();
    await settle();
    expect(checked.generate).toHaveBeenCalledOnce();
    checked.cancel.mockClear();
    (view.controls.count as unknown as TestControl).dispatchEvent(new Event("change"));
    await settle();
    expect(checked.cancel).toHaveBeenCalledOnce();
    expect(view.setGeneratedMnemonic).not.toHaveBeenCalled();
  });

  it("offers a phrase made with chosen words to the backup tabs (AUD-019-UI001)", async () => {
    const PHRASE =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const chosenWords = {
      onChange: vi.fn(),
      useChecked: vi.fn(),
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
      useChecked: vi.fn(),
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
