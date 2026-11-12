// The controller fixtures of controller.test.ts and its siblings: the actual controller on a view of
// passive native controls, with startup and derivation answered by the test.
import { vi } from "vitest";
import { createKeyDerivationController } from "../src/ui/controller.js";
import type { KeyDerivationView } from "../src/ui/view.js";
import type { DerivationResult } from "@ckd/core/types.js";
import type { DerivationWorkerClient } from "../src/workers/derive-client.js";
import { generationViews } from "./fake-generation-view.js";
import {
  ControllerTestControl as TestControl,
  ControllerTestForm as TestForm,
} from "@ckd/test-support/controller-events.js";

export type ResultTestWorker = Pick<DerivationWorkerClient, "ready" | "derive" | "terminate">;

export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function installNativeWindow(): void {
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
export function controllerHarness(extra: Record<string, unknown> = {}) {
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
  const views = generationViews();
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
    generationProgress: views.generationProgress,
    generationOutlook: views.generationOutlook,
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
    generation: views.progress,
  };
}

export function streamResult(start: number): DerivationResult {
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

export async function streamHarness(extra: Record<string, unknown> = {}) {
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
