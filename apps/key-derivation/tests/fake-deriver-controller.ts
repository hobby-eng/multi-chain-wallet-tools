// Actual main controller on an explicit synthetic view. Startup verdicts and derivation are stubs.
// Shared by lifecycle tests; source byte markers never represent real seed derivation.
import { vi } from "vitest";
import { createKeyDerivationController } from "../src/ui/controller.js";
import type { KeyDerivationView } from "../src/ui/view.js";
import { installSilentPaymentFeature } from "../src/ui/silent-payment-feature.js";
import type { SilentPaymentResult } from "../src/workers/silent-payment.js";
import { RecoveryTestPage } from "./fake-recovery-page.js";

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(cause: Error): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** The actual controller and feature are installed; its view is a small explicit contract stub. */
export function installControllerFixture(
  page: RecoveryTestPage,
  fixture: {
    otherPhrase: string;
    seedBytes: number;
    seedMarker: number;
    otherSeedMarker: number;
  },
  pendingDerivations: Deferred<SilentPaymentResult>[] = [],
  withSilentPayments = false,
) {
  const controls = Object.fromEntries(
    [
      "coin",
      "protocolTabs",
      "network",
      "account",
      "branchInput",
      "branchSelect",
      "includeChange",
      "includeCoinJoin",
      "includeLegacyMobile",
      "start",
      "count",
      "preview",
    ].map((name) => [
      name,
      page.add(`test-control-${name}`, name === "protocolTabs" ? "div" : "input"),
    ]),
  );
  controls.network!.value = "mainnet";
  controls.account!.value = controls.start!.value = "0";
  controls.count!.value = "1";
  const viewElements = Object.fromEntries(
    [
      "form",
      "mnemonic",
      "passphrase",
      "exportFormat",
      "modeBasic",
      "modeAdvanced",
      "resultReceiveTab",
      "resultChangeTab",
      "resultCoinJoinTab",
      "resultCoinJoinExternalTab",
      "resultCoinJoinInternalTab",
      "toggleSensitiveValues",
      "toggleResultSecrets",
      "copyMnemonicButton",
      "copyWatchOnlyButton",
      "downloadWatchOnlyButton",
      "cancelDerivationButton",
      "generate12Button",
      "generate15Button",
      "generate18Button",
      "generate21Button",
      "generate24Button",
      "clearAllButton",
      "selectAllButton",
      "selectNoneButton",
      "selectInvertButton",
    ].map((name) => [
      name,
      page.add(`test-view-${name}`, name === "mnemonic" ? "textarea" : "button"),
    ]),
  );
  viewElements.mnemonic!.value = "";
  const viewMethods = Object.fromEntries(
    [
      "showError",
      "showStatus",
      "clearMessages",
      "populateCoinSelect",
      "configureControls",
      "updateWordCount",
      "updateSeedDiagnostic",
      "updateMode",
      "updateBulkActions",
      "populateBuildPassport",
      "setCryptoControlsEnabled",
      "showCryptoSelfTestPassed",
      "showCryptoSelfTestFailed",
      "setRecoverySourceVisibility",
      "setResultSecretsVisibility",
      "resetDeriveAction",
      "hideSearchResult",
      "clearResults",
      "updatePathPreview",
      "showDerivationRunning",
      "showDerivationIdle",
      "showResults",
      "renderCurrent",
      "updateResultBranchTabs",
      "scrollResultsIntoView",
      "flashCopied",
      "setDownloadPreparing",
      "resultBranchEnabled",
      "focusResultBranch",
    ].map((name) => [name, vi.fn()]),
  );
  const view = {
    ...viewElements,
    ...viewMethods,
    document: page,
    controls,
    descriptorButtons: {},
    documentActionFrom: () => null,
    setGeneratedMnemonic: (phrase: string) => {
      viewElements.mnemonic!.value = phrase;
    },
    clearAllInputs: () => {
      viewElements.mnemonic!.value = viewElements.passphrase!.value = "";
    },
  } as unknown as KeyDerivationView;
  if (withSilentPayments) {
    const label = page.createElement("label");
    page.add("include-silent-payment", "input", label).checked = true;
    page.body.append(label);
    for (const id of ["silent-payment-tab", "derive-silent-payment"]) page.add(id, "button");
    for (const id of ["silent-payment-network", "silent-payment-account", "silent-payment-labels"])
      page.add(id, "input");
    page.require("silent-payment-network").value = "mainnet";
    page.require("silent-payment-account").value = "0";
    for (const id of [
      "silent-payment-panel",
      "silent-payment-result",
      "silent-payment-error",
      "silent-payment-labeled-list",
      "silent-payment-address",
      "silent-payment-change-address",
      "silent-payment-scan-path",
      "silent-payment-scan-key",
      "silent-payment-spend-path",
      "silent-payment-spend-key",
    ])
      page.add(id);
    page.require("silent-payment-result").hidden = true;
  }
  const selfTest = { passed: true, checks: ["Synthetic startup verdict"], durationMs: 0 };
  const deriveSilentPayment = vi.fn(
    (_seed: Uint8Array, _network: string, _account: number, _labels: readonly number[]) => {
      const pending = deferred<SilentPaymentResult>();
      pendingDerivations.push(pending);
      return pending.promise;
    },
  );
  const adapter = {
    id: "bitcoin-bip44",
    label: "Bitcoin",
    variantLabel: "BIP44",
    networkControl: true,
    defaults: { network: "mainnet", account: 0, branch: 0, start: 0, count: 1 },
    batchSize: 1,
  };
  const dependencies = {
    coinFamilies: [{ id: "bitcoin", label: "Bitcoin" }],
    getAdapterFamilyId: () => "bitcoin",
    getCoinAdapter: () => adapter,
    getDefaultCoinAdapter: () => adapter,
    buildInfo: {},
    generateMnemonic: () => fixture.otherPhrase,
    // Distinct byte markers make the new-source dispatch observable without deriving any seed.
    mnemonicToSeed: vi.fn((phrase: string) =>
      new Uint8Array(fixture.seedBytes).fill(
        phrase === fixture.otherPhrase ? fixture.otherSeedMarker : fixture.seedMarker,
      ),
    ),
    runBip39SelfTest: () => selfTest,
    runRecoveryBackupSelfTest: () => selfTest,
    setRecoveryControlsEnabled: vi.fn(),
    writeClipboard: vi.fn(async () => undefined),
    downloadBlob: vi.fn(),
    downloadText: vi.fn(),
    createWorker: () => ({
      ready: async () => undefined,
      selfTest: async () => selfTest,
      deriveSilentPayment,
      derive: async () => ({
        id: adapter.id,
        rows: [{ index: 0, basic: [], advanced: [] }],
        basicSummary: [],
        summary: [],
      }),
      terminate: () => undefined,
    }),
    ...(withSilentPayments ? { installSilentPaymentFeature } : {}),
  } as unknown as Parameters<typeof createKeyDerivationController>[1];
  createKeyDerivationController(view, dependencies).start();
  return { page, view, viewElements, dependencies, deriveSilentPayment };
}
