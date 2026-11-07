import { CopyFeedback } from "@ckd/ui/copy-feedback.js";
import { BIP39_WORD_COUNTS } from "@ckd/core/bip39-word-counts.js";
import { markTab } from "@ckd/ui/tabs.js";
import { ButtonActivity } from "@ckd/ui/button-activity.js";
import { ENGLISH_BIP39_WORDS } from "@ckd/core/bip39-word-reader.js";
import { AccountExportController } from "./account-export-controller.js";
import { PasswordControl } from "./password-control.js";
import { requireQueryElement } from "@ckd/ui/dom.js";
import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult, DisplayMode } from "@ckd/core/types.js";
import { ExportChoice, ExportChoiceError, inspectSelectedRows } from "@ckd/export/formatter.js";
import {
  configureControls,
  populateCoinSelect,
  updatePathPreview,
  type CoinMetadataRegistry,
  type DerivationControlValues,
  type DerivationControls,
} from "./inputs.js";
import { resultBranchGroup, type BranchResultState, type ResultBranch } from "./result-branches.js";
import { renderResults, updateSecretVisibility, type ResultsRenderOptions } from "./results.js";
import { clearRenderedSecrets } from "./secrets.js";
import type { AddressSearchViewElements } from "./address-search-feature.js";
import { renderSeedDiagnostic, type SeedDiagnosticPresentation } from "./seed-diagnostic-view.js";
import { Bip39InputText } from "./bip39-input-text.js";

type DocumentAction =
  | { kind: "bulk"; button: HTMLButtonElement; action: unknown }
  | { kind: "download"; button: HTMLButtonElement; action: unknown }
  | {
      kind: "copy-field";
      button: HTMLButtonElement;
      scope: "summary" | "row";
      fieldKey: string;
      rowIndex?: number;
    };

/** Native fields and rendering bindings; wallet rules and export admission stay in their libraries. */
export class KeyDerivationView {
  readonly document: Document;
  readonly #registry: CoinMetadataRegistry;
  readonly addressSearch: AddressSearchViewElements | undefined;
  readonly controls: DerivationControls;
  readonly errorRoot;
  readonly statusRoot;
  readonly mnemonic;
  readonly passphrase;
  /** The passphrase field with its own Show, which follows Show phrase too. */
  readonly #passphraseControl;
  readonly wordCount;
  readonly #seedDiagnostic;
  readonly deriveButton;
  readonly resultsRoot;
  readonly resultTitle;
  readonly summaryRoot;
  readonly noticesRoot;
  readonly listRoot;
  readonly #passphraseInUse;
  readonly selectedCount;
  readonly modeBasic;
  readonly modeAdvanced;
  readonly resultBranchTabs;
  readonly resultReceiveTab;
  readonly resultChangeTab;
  readonly resultCoinJoinTab;
  readonly coinJoinBranchTabs;
  readonly resultCoinJoinExternalTab;
  readonly resultCoinJoinInternalTab;
  readonly #branchTabButtons: Record<ResultBranch, HTMLButtonElement>;
  readonly branchResultContent;
  readonly toggleSensitiveValues;
  readonly toggleResultSecrets;
  readonly copyMnemonicButton;
  readonly copyWatchOnlyButton;
  readonly downloadWatchOnlyButton;
  readonly descriptorButtons;
  readonly #descriptorPanel;
  readonly #descriptorDialog;
  readonly #descriptorDescription;
  readonly watchOnlyPanel;
  readonly watchOnlyDescription;
  readonly searchAddressButton;
  readonly #addressSearchPanel;
  readonly selfTestStatus;
  readonly selfTestDetails;
  readonly #workerRuntime;
  readonly generate12Button;
  readonly generate15Button;
  readonly generate18Button;
  readonly generate21Button;
  readonly generate24Button;
  readonly cancelDerivationButton;
  readonly expectedAddress;
  readonly searchStart;
  readonly searchCount;
  readonly searchResult;
  readonly #buttonActivity;
  readonly #copyFeedback;
  #cryptoControlsEnabled;
  #addressSearchAvailable;
  readonly form;
  readonly exportFormat;
  readonly clearAllButton;
  readonly selectAllButton;
  readonly selectNoneButton;
  readonly selectInvertButton;
  readonly downloadSelectionButton;
  readonly required = <T extends Element>(selector: string): T =>
    requireQueryElement<T>(this.document, selector, "Application template");
  constructor(
    document: Document,
    registry: CoinMetadataRegistry,
    addressSearch?: AddressSearchViewElements,
  ) {
    this.document = document;
    this.#copyFeedback = new CopyFeedback(document.defaultView ?? window);
    this.#registry = registry;
    this.addressSearch = addressSearch;
    this.controls = {
      coin: this.required<HTMLSelectElement>("#coin"),
      protocolTabs: this.required<HTMLElement>("#protocol-tabs"),
      legacyMobileField: this.required<HTMLElement>("#legacy-mobile-field"),
      includeLegacyMobile: this.required<HTMLInputElement>("#include-legacy-mobile"),
      network: this.required<HTMLSelectElement>("#network"),
      networkField: this.required<HTMLElement>("#network-field"),
      accountField: this.required<HTMLElement>("#account-field"),
      accountLabel: this.required<HTMLLabelElement>("#account-label"),
      account: this.required<HTMLInputElement>("#account"),
      branchField: this.required<HTMLElement>("#branch-field"),
      branchLabel: this.required<HTMLLabelElement>("#branch-label"),
      branchInput: this.required<HTMLInputElement>("#branch-input"),
      branchSelect: this.required<HTMLSelectElement>("#branch-select"),
      changeField: this.required<HTMLElement>("#change-addresses-field"),
      changeHelp: this.required<HTMLElement>("#change-addresses-help"),
      includeChange: this.required<HTMLInputElement>("#include-change-addresses"),
      coinJoinField: this.required<HTMLElement>("#coinjoin-addresses-field"),
      includeCoinJoin: this.required<HTMLInputElement>("#include-coinjoin-addresses"),
      coinJoinHelp: this.required<HTMLElement>("#coinjoin-path-help"),
      startLabel: this.required<HTMLLabelElement>("#start-label"),
      start: this.required<HTMLInputElement>("#start"),
      countLabel: this.required<HTMLLabelElement>("#count-label"),
      count: this.required<HTMLInputElement>("#count"),
      preview: this.required<HTMLElement>("#path-preview"),
      textControls: this.required<HTMLElement>("#protocol-text-controls"),
    };
    this.errorRoot = this.required<HTMLElement>("#error");
    this.statusRoot = this.required<HTMLElement>("#status");
    this.mnemonic = this.required<HTMLTextAreaElement>("#mnemonic");
    this.passphrase = this.required<HTMLInputElement>("#passphrase");
    this.#passphraseControl = new PasswordControl(
      this.passphrase,
      this.required<HTMLButtonElement>("#toggle-passphrase"),
      "BIP39 passphrase",
    );
    this.wordCount = this.required<HTMLElement>("#word-count");
    this.#seedDiagnostic = this.required<HTMLElement>("#seed-diagnostic");
    this.deriveButton = this.required<HTMLButtonElement>("#derive-button");
    this.resultsRoot = this.required<HTMLElement>("#results");
    this.resultTitle = this.required<HTMLElement>("#result-title");
    this.summaryRoot = this.required<HTMLElement>("#summary");
    this.noticesRoot = this.required<HTMLElement>("#result-notices");
    this.listRoot = this.required<HTMLElement>("#address-list");
    this.#passphraseInUse = this.required<HTMLElement>("#passphrase-in-use");
    this.selectedCount = this.required<HTMLElement>("#selected-count");
    this.modeBasic = this.required<HTMLButtonElement>("#mode-basic");
    this.modeAdvanced = this.required<HTMLButtonElement>("#mode-advanced");
    this.resultBranchTabs = this.required<HTMLElement>("#result-branch-tabs");
    this.resultReceiveTab = this.required<HTMLButtonElement>("#result-receive-tab");
    this.resultChangeTab = this.required<HTMLButtonElement>("#result-change-tab");
    this.resultCoinJoinTab = this.required<HTMLButtonElement>("#result-coinjoin-tab");
    this.coinJoinBranchTabs = this.required<HTMLElement>("#coinjoin-branch-tabs");
    this.resultCoinJoinExternalTab = this.required<HTMLButtonElement>(
      "#result-coinjoin-external-tab",
    );
    this.resultCoinJoinInternalTab = this.required<HTMLButtonElement>(
      "#result-coinjoin-internal-tab",
    );
    this.#branchTabButtons = {
      receive: this.resultReceiveTab,
      change: this.resultChangeTab,
      "coinjoin-external": this.resultCoinJoinExternalTab,
      "coinjoin-internal": this.resultCoinJoinInternalTab,
    };
    this.branchResultContent = this.required<HTMLElement>("#branch-result-content");
    this.toggleSensitiveValues = this.required<HTMLButtonElement>("#toggle-sensitive-values");
    this.toggleResultSecrets = this.required<HTMLButtonElement>("#toggle-result-secrets");
    this.copyMnemonicButton = this.required<HTMLButtonElement>("#copy-mnemonic");
    this.copyWatchOnlyButton = this.required<HTMLButtonElement>("#copy-watch-only");
    this.downloadWatchOnlyButton = this.required<HTMLButtonElement>("#download-watch-only");
    this.descriptorButtons = {
      publicCopy: this.required<HTMLButtonElement>("#copy-public-descriptors"),
      publicDownload: this.required<HTMLButtonElement>("#download-public-descriptors"),
      privateCopy: this.required<HTMLButtonElement>("#copy-private-descriptors"),
      privateDownload: this.required<HTMLButtonElement>("#download-private-descriptors"),
    };
    this.#descriptorPanel = this.required<HTMLElement>("#account-descriptor-export");
    this.#descriptorDialog = this.required<HTMLDialogElement>("#account-export-dialog");
    this.required<HTMLButtonElement>("#open-account-export").addEventListener("click", () =>
      this.#descriptorDialog.showModal(),
    );
    this.required<HTMLButtonElement>("#close-account-export").addEventListener("click", () =>
      this.#descriptorDialog.close(),
    );
    this.#descriptorDescription = this.required<HTMLElement>("#account-descriptor-description");
    this.watchOnlyPanel = this.required<HTMLElement>("#watch-only-export");
    this.watchOnlyDescription = this.required<HTMLElement>("#watch-only-description");
    this.searchAddressButton = this.addressSearch?.button ?? null;
    this.#addressSearchPanel = this.addressSearch?.panel ?? null;
    this.selfTestStatus = this.required<HTMLElement>("#crypto-self-test-status");
    this.selfTestDetails = this.required<HTMLElement>("#crypto-self-test-details");
    this.#workerRuntime = this.required<HTMLElement>("#worker-runtime");
    this.generate12Button = this.required<HTMLButtonElement>("#generate-12");
    this.generate15Button = this.required<HTMLButtonElement>("#generate-15");
    this.generate18Button = this.required<HTMLButtonElement>("#generate-18");
    this.generate21Button = this.required<HTMLButtonElement>("#generate-21");
    this.generate24Button = this.required<HTMLButtonElement>("#generate-24");
    this.cancelDerivationButton = this.required<HTMLButtonElement>("#cancel-derivation");
    this.expectedAddress = this.addressSearch?.expectedAddress ?? null;
    this.searchStart = this.addressSearch?.searchStart ?? null;
    this.searchCount = this.addressSearch?.searchCount ?? null;
    this.searchResult = this.addressSearch?.result ?? null;
    this.#buttonActivity = new ButtonActivity();
    this.#cryptoControlsEnabled = false;
    this.#addressSearchAvailable =
      this.searchAddressButton !== null && this.#addressSearchPanel !== null;
    this.form = this.required<HTMLFormElement>("#derive-form");
    this.exportFormat = this.required<HTMLSelectElement>("#export-format");
    this.clearAllButton = this.required<HTMLButtonElement>("#clear-all");
    this.selectAllButton = this.required<HTMLButtonElement>("#select-all");
    this.selectNoneButton = this.required<HTMLButtonElement>("#select-none");
    this.selectInvertButton = this.required<HTMLButtonElement>("#select-invert");
    this.downloadSelectionButton = this.required<HTMLButtonElement>("#download-selection");
  }
  readonly showError = (message: string): void => {
    this.statusRoot.hidden = true;
    this.errorRoot.textContent = message;
    this.errorRoot.hidden = false;
  };
  readonly showStatus = (message: string): void => {
    this.errorRoot.hidden = true;
    this.statusRoot.textContent = message;
    this.statusRoot.hidden = false;
  };
  readonly clearMessages = (): void => {
    this.errorRoot.textContent = "";
    this.errorRoot.hidden = true;
    this.statusRoot.textContent = "";
    this.statusRoot.hidden = true;
  };
  readonly populateCoinSelect = (): void => {
    populateCoinSelect(this.controls.coin, this.#registry);
  };
  readonly configureControls = (adapter: CoinAdapter, values?: DerivationControlValues): void => {
    configureControls(adapter, this.controls, this.#registry, values);
    this.#addressSearchAvailable =
      this.searchAddressButton !== null && this.#addressSearchPanel !== null;
    if (this.#addressSearchPanel !== null) this.#addressSearchPanel.hidden = false;
    if (this.searchAddressButton !== null)
      this.searchAddressButton.disabled = !this.#cryptoControlsEnabled;
  };
  readonly updatePathPreview = (adapter: CoinAdapter): void => {
    updatePathPreview(adapter, this.controls);
  };
  readonly resetDeriveAction = (): void => {
    this.deriveButton.textContent = "Derive selected results";
  };
  readonly showLargeRequestConfirmation = (): void => {
    this.deriveButton.textContent = "Confirm large request";
  };
  readonly showDerivationRunning = (): void => {
    this.deriveButton.disabled = true;
    this.deriveButton.textContent = "Deriving…";
    this.cancelDerivationButton.hidden = false;
    this.cancelDerivationButton.disabled = false;
  };
  readonly showDerivationIdle = (enabled: boolean): void => {
    this.deriveButton.disabled = !enabled;
    this.deriveButton.textContent = "Derive selected results";
    this.cancelDerivationButton.hidden = true;
  };
  readonly showCancellationRequested = (): void => {
    this.cancelDerivationButton.disabled = true;
  };
  readonly flashCopied = (button: HTMLButtonElement): void => {
    this.#copyFeedback.flash(button);
  };
  readonly setDownloadPreparing = (button: HTMLButtonElement, preparing: boolean): void => {
    if (preparing) {
      this.#buttonActivity.start(button, "Preparing…");
      return;
    }
    this.#buttonActivity.finish(button);
  };
  readonly hideSearchResult = (): void => {
    if (this.searchResult !== null) this.searchResult.hidden = true;
  };
  readonly showSearchResult = (message: string, matched: boolean): void => {
    if (this.searchResult === null) return;
    this.searchResult.textContent = message;
    this.searchResult.classList.toggle("search-match", matched);
    this.searchResult.hidden = false;
  };
  readonly setSearchRunning = (running: boolean): void => {
    if (running) {
      if (this.searchAddressButton === null) return;
      this.#buttonActivity.start(this.searchAddressButton, "Searching…");
      return;
    }
    if (this.searchAddressButton === null) return;
    this.#buttonActivity.finish(this.searchAddressButton);
    this.searchAddressButton.disabled =
      !this.#cryptoControlsEnabled || !this.#addressSearchAvailable;
  };
  readonly setGeneratedMnemonic = (phrase: string, resultCount: number): void => {
    this.mnemonic.value = phrase;
    this.controls.start.value = "0";
    this.controls.count.value = String(resultCount);
  };
  readonly clearAllInputs = (): void => {
    this.mnemonic.value = "";
    this.passphrase.value = "";
    if (this.expectedAddress !== null) this.expectedAddress.value = "";
    if (this.searchStart !== null) this.searchStart.value = this.searchStart.defaultValue;
    if (this.searchCount !== null) this.searchCount.value = this.searchCount.defaultValue;
    this.searchResult?.replaceChildren();
    if (this.searchResult !== null) this.searchResult.hidden = true;
    this.mnemonic.focus();
  };
  readonly scrollResultWindowIntoView = (): void => {
    this.listRoot.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  readonly scrollResultsIntoView = (): void => {
    this.resultsRoot.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  readonly updateWordCount = (revealed: boolean): void => {
    try {
      const count = ENGLISH_BIP39_WORDS.wordCount(this.mnemonic.value);
      this.wordCount.textContent = `${count} word${count === 1 ? "" : "s"}`;
      this.copyMnemonicButton.disabled = !revealed || count === 0;
    } catch (cause) {
      if (Bip39InputText.of(cause) === undefined) throw cause;
      this.wordCount.textContent = Bip39InputText.COUNT_UNAVAILABLE;
      this.copyMnemonicButton.disabled = true;
    }
  };
  readonly updateSeedDiagnostic = (
    diagnostic: SeedDiagnosticPresentation,
    fingerprint: string | null,
    revealed: boolean,
  ): void => {
    renderSeedDiagnostic(this.document, this.#seedDiagnostic, diagnostic, fingerprint, revealed);
  };
  readonly clearResults = (): void => {
    clearRenderedSecrets(this.summaryRoot);
    clearRenderedSecrets(this.listRoot);
    this.noticesRoot.replaceChildren();
    this.resultBranchTabs.hidden = true;
    this.coinJoinBranchTabs.hidden = true;
    this.resultsRoot.classList.remove("revealed");
    this.resultsRoot.hidden = true;
  };
  readonly renderCurrent = (
    result: DerivationResult,
    options: ResultsRenderOptions,
    branchStates: ReadonlyMap<ResultBranch, BranchResultState>,
    activeBranch: ResultBranch,
    adapter: CoinAdapter,
    sensitiveValuesRevealed: boolean,
  ): void => {
    clearRenderedSecrets(this.summaryRoot);
    clearRenderedSecrets(this.listRoot);
    renderResults(this.summaryRoot, this.listRoot, this.noticesRoot, result, options);
    // The passphrase field shows only dots; the addresses say whose wallet they are.
    this.#passphraseInUse.hidden = this.passphrase.value === "";
    updateSecretVisibility(this.resultsRoot, sensitiveValuesRevealed);
    this.updateMode(options.mode);
    this.updateResultBranchTabs(result, branchStates, activeBranch);
    this.updateBulkActions(
      result,
      options.selected,
      adapter,
      options.mode,
      sensitiveValuesRevealed,
    );
  };
  readonly updateResultBranchTabs = (
    result: DerivationResult | null,
    branchStates: ReadonlyMap<ResultBranch, BranchResultState>,
    activeBranch: ResultBranch,
  ): void => {
    const hasChange = branchStates.has("change");
    const hasReceive = branchStates.has("receive");
    const hasCoinJoin =
      branchStates.has("coinjoin-external") || branchStates.has("coinjoin-internal");
    this.resultBranchTabs.hidden =
      (!hasChange && !hasCoinJoin) || (hasCoinJoin && !hasReceive && !hasChange);
    this.resultReceiveTab.hidden = !hasReceive;
    this.resultChangeTab.hidden = !hasChange;
    this.resultCoinJoinTab.hidden = !hasCoinJoin;
    const activeGroup = resultBranchGroup(activeBranch);
    this.coinJoinBranchTabs.hidden = !hasCoinJoin || activeGroup !== "coinjoin";
    if (result !== null) {
      const suffix =
        activeGroup === "receive"
          ? hasChange || hasCoinJoin
            ? " · Receive addresses"
            : ""
          : activeGroup === "change"
            ? " · Change addresses"
            : "";
      this.resultTitle.textContent = `${result.title}${suffix}`;
    }
    for (const [button, branch] of [
      [this.resultReceiveTab, "receive"],
      [this.resultChangeTab, "change"],
    ] as const) {
      const active = activeGroup === branch;
      markTab(button, active);
      button.disabled = !branchStates.has(branch);
    }
    const coinJoinActive = activeGroup === "coinjoin";
    markTab(this.resultCoinJoinTab, coinJoinActive);
    this.resultCoinJoinTab.disabled = !hasCoinJoin;
    for (const [button, branch] of [
      [this.resultCoinJoinExternalTab, "coinjoin-external"],
      [this.resultCoinJoinInternalTab, "coinjoin-internal"],
    ] as const) {
      const active = activeBranch === branch;
      markTab(button, active);
      button.disabled = !branchStates.has(branch);
    }
    this.branchResultContent.setAttribute(
      "aria-labelledby",
      this.#branchTabButtons[activeBranch].id,
    );
  };
  readonly updateMode = (mode: DisplayMode): void => {
    const basic = mode === "basic";
    this.document.body.classList.toggle("result-mode-basic", basic);
    this.document.body.classList.toggle("result-mode-advanced", !basic);
    this.resultsRoot.classList.toggle("mode-basic", basic);
    this.resultsRoot.classList.toggle("mode-advanced", !basic);
    this.modeBasic.classList.toggle("active", basic);
    this.modeBasic.setAttribute("aria-pressed", String(basic));
    this.modeAdvanced.classList.toggle("active", !basic);
    this.modeAdvanced.setAttribute("aria-pressed", String(!basic));
  };
  readonly updateBulkActions = (
    result: DerivationResult | null,
    selected: ReadonlySet<number>,
    adapter: CoinAdapter,
    mode: DisplayMode,
    revealed: boolean,
  ): void => {
    this.selectedCount.textContent = String(selected.size);
    for (const button of this.document.querySelectorAll<HTMLButtonElement>(
      "[data-bulk],[data-download]",
    )) {
      if (result === null || selected.size === 0) {
        button.disabled = true;
        continue;
      }
      try {
        const action = ExportChoice.action(button.dataset.bulk ?? button.dataset.download);
        const inspection = inspectSelectedRows(adapter, result, selected, mode, action);
        button.disabled = inspection.valueCount === 0 || (inspection.containsSecret && !revealed);
      } catch (cause) {
        button.disabled = true;
        this.showError(
          cause instanceof ExportChoiceError
            ? cause.message
            : "Unable to inspect the selected result fields.",
        );
      }
    }
    this.required<HTMLButtonElement>("#select-all").disabled = result === null;
    this.required<HTMLButtonElement>("#select-none").disabled =
      result === null || selected.size === 0;
    this.required<HTMLButtonElement>("#select-invert").disabled = result === null;
    const descriptors = result?.accountDescriptors;
    this.#descriptorPanel.hidden = descriptors === undefined;
    if (descriptors === undefined && this.#descriptorDialog.open) this.#descriptorDialog.close();
    this.#descriptorDescription.textContent =
      result === null || descriptors === undefined
        ? ""
        : `${result.title} · ${result.networkLabel} · account ${descriptors.accountPath}`;
    for (const [action, button] of Object.entries(this.descriptorButtons)) {
      AccountExportController.updateButton(button, action, descriptors !== undefined, revealed);
    }
    const watchOnly = descriptors === undefined ? result?.watchOnly : undefined;
    this.watchOnlyPanel.hidden = watchOnly === undefined;
    this.copyWatchOnlyButton.disabled = watchOnly === undefined || !revealed;
    this.downloadWatchOnlyButton.disabled = watchOnly === undefined || !revealed;
    if (watchOnly === undefined) {
      this.watchOnlyDescription.textContent = "";
      return;
    }
    this.watchOnlyDescription.textContent = watchOnly.description;
    // The panel heading already says "Watch-only export"; the full action name stays in the accessible label.
    this.copyWatchOnlyButton.setAttribute("aria-label", watchOnly.label);
    this.downloadWatchOnlyButton.setAttribute("aria-label", `Save ${watchOnly.fileName}`);
    this.copyWatchOnlyButton.title = revealed
      ? watchOnly.description
      : `Show sensitive values first. ${watchOnly.description}`;
    this.downloadWatchOnlyButton.title = revealed
      ? `Save ${watchOnly.fileName}`
      : `Show sensitive values before saving ${watchOnly.fileName}.`;
  };
  readonly setRecoverySourceVisibility = (revealed: boolean): void => {
    this.mnemonic.classList.toggle("concealed", !revealed);
    this.#passphraseControl.setVisible(revealed);
    this.toggleSensitiveValues.textContent = revealed ? "Hide phrase" : "Show phrase";
    this.toggleSensitiveValues.setAttribute("aria-pressed", String(revealed));
    this.copyMnemonicButton.disabled = !revealed || this.mnemonic.value.trim().length === 0;
  };
  readonly setResultSecretsVisibility = (revealed: boolean): void => {
    updateSecretVisibility(this.resultsRoot, revealed);
    this.toggleResultSecrets.textContent = revealed ? "Hide private keys" : "Show private keys";
    this.toggleResultSecrets.setAttribute("aria-pressed", String(revealed));
  };
  readonly showResults = (): void => {
    this.resultsRoot.hidden = false;
  };
  readonly populateBuildPassport = (info: {
    version: string;
    releaseDate: string;
    fingerprint: string;
    checksumFile: string;
    profile: string;
    edition: string;
    coins?: readonly string[];
    features?: readonly string[];
  }): void => {
    this.required<HTMLElement>("#build-version").textContent = info.version;
    this.required<HTMLElement>("#build-date").textContent = info.releaseDate;
    this.required<HTMLElement>("#build-edition").textContent = info.edition;
    this.required<HTMLElement>("#build-profile").textContent = info.profile;
    this.required<HTMLElement>("#build-coins").textContent =
      info.coins?.join(", ") ?? "profile default";
    this.required<HTMLElement>("#build-features").textContent =
      info.features?.join(", ") ?? "profile default";
    this.required<HTMLElement>("#build-fingerprint").textContent = info.fingerprint;
    this.required<HTMLElement>("#artifact-checksum-file").textContent = info.checksumFile;
  };
  readonly setCryptoControlsEnabled = (enabled: boolean): void => {
    this.#cryptoControlsEnabled = enabled;
    this.deriveButton.disabled = !enabled;
    if (this.searchAddressButton !== null)
      this.searchAddressButton.disabled = !enabled || !this.#addressSearchAvailable;
    for (const words of BIP39_WORD_COUNTS) this[`generate${words}Button`].disabled = !enabled;
  };
  readonly showCryptoSelfTestPassed = (checks: readonly string[], durationMs: number): void => {
    this.selfTestStatus.classList.remove("checking", "failed");
    this.selfTestStatus.classList.add("passed");
    this.selfTestStatus.textContent = "Cryptographic self-test passed";
    this.selfTestDetails.textContent = `${checks.length} deterministic vectors passed in ${durationMs.toLocaleString()} ms: ${checks.join(" · ")}. Derivation is enabled.`;
    this.#workerRuntime.textContent = "Dedicated Web Worker · active";
  };
  readonly showCryptoSelfTestFailed = (cause: unknown): void => {
    this.selfTestStatus.classList.remove("checking", "passed");
    this.selfTestStatus.classList.add("failed");
    this.selfTestStatus.textContent = "Cryptographic self-test failed";
    this.selfTestDetails.textContent = cause instanceof Error ? cause.message : String(cause);
    this.#workerRuntime.textContent = "Blocked · self-test failure";
  };
  readonly protocolAdapterIdFrom = (target: EventTarget | null): string | undefined => {
    if (!(target instanceof Element)) return undefined;
    return target.closest<HTMLButtonElement>("[data-adapter-id]")?.dataset.adapterId;
  };
  readonly protocolAdapterIds = (): string[] => {
    return [
      ...this.controls.protocolTabs.querySelectorAll<HTMLButtonElement>("[data-adapter-id]"),
    ].flatMap((button) => button.dataset.adapterId ?? []);
  };
  readonly focusProtocolButton = (adapterId: string): void => {
    this.controls.protocolTabs
      .querySelector<HTMLButtonElement>(`[data-adapter-id="${adapterId}"]`)
      ?.focus();
  };
  readonly resultBranchEnabled = (branch: ResultBranch): boolean => {
    return !this.#branchTabButtons[branch].disabled;
  };
  readonly focusResultBranch = (branch: ResultBranch): void => {
    this.#branchTabButtons[branch].focus();
  };
  readonly documentActionFrom = (target: EventTarget | null): DocumentAction | null => {
    if (!(target instanceof Element)) return null;
    const bulkButton = target.closest<HTMLButtonElement>("[data-bulk]");
    if (bulkButton?.dataset.bulk !== undefined) {
      return {
        kind: "bulk",
        button: bulkButton,
        action: bulkButton.dataset.bulk,
      };
    }
    const downloadButton = target.closest<HTMLButtonElement>("[data-download]");
    if (downloadButton?.dataset.download !== undefined) {
      return {
        kind: "download",
        button: downloadButton,
        action: downloadButton.dataset.download,
      };
    }
    const copyButton = target.closest<HTMLButtonElement>("[data-copy-field]");
    const scope = copyButton?.dataset.copyScope;
    const fieldKey = copyButton?.dataset.copyField;
    if (copyButton === null || (scope !== "summary" && scope !== "row") || fieldKey === undefined) {
      return null;
    }
    const copyRow = copyButton.dataset.copyRow;
    return copyRow === undefined
      ? { kind: "copy-field", button: copyButton, scope, fieldKey }
      : { kind: "copy-field", button: copyButton, scope, fieldKey, rowIndex: Number(copyRow) };
  };
}
/** Compatibility constructor for existing feature composition and tests. */
export function createKeyDerivationView(
  document: Document,
  registry: CoinMetadataRegistry,
  addressSearch?: AddressSearchViewElements,
): KeyDerivationView {
  return new KeyDerivationView(document, registry, addressSearch);
}
