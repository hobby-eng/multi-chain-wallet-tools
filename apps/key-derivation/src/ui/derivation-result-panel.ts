import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DisplayMode, ResultField } from "@ckd/core/types.js";
import { displayedFields } from "@ckd/export/formatter.js";
import type { DerivationResults } from "@ckd/ui/derivation-results.js";
import { ResultWindow } from "@ckd/ui/result-window.js";
import { AccountExportController } from "./account-export-controller.js";
import type { Bip38EncryptionFeature } from "./bip38-encryption-feature.js";
import type { Bip85Feature } from "./bip85-feature.js";
import type { DerivationFeatureTab } from "./inputs.js";
import type { MessageSigningFeature } from "./message-signing-feature.js";
import type { ResultBranch } from "./result-branches.js";
import { ResultExportController } from "./result-export-controller.js";
import { ResultTabNavigation } from "./result-tab-navigation.js";
import type { SilentPaymentFeature } from "./silent-payment-feature.js";
import type { KeyDerivationView } from "./view.js";

interface DerivationResultPanelOptions {
  view: KeyDerivationView;
  results: DerivationResults;
  adapter(): CoinAdapter;
  feature(): DerivationFeatureTab;
  bip38(): Bip38EncryptionFeature | undefined;
  signing(): MessageSigningFeature | undefined;
  bip85(): Bip85Feature | null;
  silentPayment(): SilentPaymentFeature | undefined;
  release(action: () => void): void;
  writeClipboard: typeof import("@ckd/export/clipboard.js").writeClipboard;
  downloadBlob: typeof import("@ckd/export/download.js").downloadBlob;
  downloadText: typeof import("@ckd/export/download.js").downloadText;
}

/** Owns main-result disclosure, navigation and native exports; derivation facts stay in the library. */
export class DerivationResultPanel {
  readonly #options: DerivationResultPanelOptions;
  readonly #exports: ResultExportController;
  #revealed = false;

  /** Feature getters are read only by later events, after the host finishes composing its features. */
  constructor(options: DerivationResultPanelOptions) {
    this.#options = options;
    const view = options.view;
    this.#exports = new ResultExportController({
      secretsRevealed: () => this.#revealed,
      writeClipboard: options.writeClipboard,
      downloadBlob: options.downloadBlob,
      flashCopied: (button) => view.flashCopied(button),
      setDownloadPreparing: (button, preparing) => view.setDownloadPreparing(button, preparing),
      showError: (message) => view.showError(message),
      showStatus: (message) => view.showStatus(message),
    });
    window.addEventListener("pagehide", () => this.#exports.invalidate());
    this.#installNavigation();
    this.#installExports();
  }

  /** Shared export owner also revokes pending child-wallet clipboard writes and downloads. */
  get exports(): ResultExportController {
    return this.#exports;
  }

  /** Disclosure permission shared by main results and optional child/feature panels. */
  get revealed(): boolean {
    return this.#revealed;
  }

  /** Revoke native publication before concealing the main and optional feature panels. */
  setRevealed(revealed: boolean): void {
    if (!revealed) this.#exports.invalidate();
    this.#revealed = revealed;
    this.#options.view.setResultSecretsVisibility(revealed);
    this.#options.bip85()?.setSecretsVisible(revealed);
    this.#options.silentPayment()?.setSecretsVisible(revealed);
    this.updateBulkActions();
  }

  /** Drop borrowed result strings and pending exports before repainting the empty workspace. */
  clear(): void {
    this.#exports.invalidate();
    const signing = this.#options.signing();
    if (signing?.activeSource() === "main") this.#options.release(() => signing.close());
    this.#options.release(() => this.#options.bip38()?.invalidate());
    this.#options.results.wipe();
    this.#options.view.clearResults();
    this.placeDisclosureControl();
    this.updateBulkActions();
  }

  /** Keep the shared disclosure control beside the active result, with the child using its own. */
  placeDisclosureControl(): void {
    const { view, results } = this.#options;
    const feature = this.#options.feature();
    view.toggleResultSecrets.hidden = feature === "bip85";
    if (feature === "bip85") return;
    const slot =
      feature === "silent-payment"
        ? "#silent-payment-secret-control-slot"
        : results.current === null
          ? "#default-result-secret-control-slot"
          : "#main-result-secret-control-slot";
    // Some embedding hosts have no movable slot; their existing control stays in place.
    view.document.querySelector?.<HTMLElement>(slot)?.append(view.toggleResultSecrets);
  }

  /** Render branch availability from the library owner's current projection. */
  updateBranchTabs(): void {
    const { view, results } = this.#options;
    view.updateResultBranchTabs(results.current, results.states, results.active);
  }

  /** Select an available branch, retaining its selection/page and optionally drawing its rows. */
  activate(branch: ResultBranch, render = true): void {
    if (!this.#options.results.activate(branch)) return;
    this.updateBranchTabs();
    this.placeDisclosureControl();
    if (render) {
      this.render();
      const bip38 = this.#options.bip38();
      if (bip38?.isReady() === true) bip38.start();
    }
  }

  /** Draw one borrowed result; no keys or address paths are computed by this page binding. */
  render(): void {
    const { view, results } = this.#options;
    if (results.current === null) return;
    view.renderCurrent(
      results.current,
      this.#renderOptions(),
      results.states,
      results.active,
      this.#options.adapter(),
      this.#revealed,
    );
  }

  /** Present selection-dependent actions using the same permission as the export owner. */
  updateBulkActions(): void {
    const { view, results } = this.#options;
    view.updateBulkActions(
      results.current,
      results.selected,
      this.#options.adapter(),
      results.mode,
      this.#revealed,
    );
  }

  #renderOptions() {
    const { view, results } = this.#options;
    const signing = this.#options.signing();
    const bip38 = this.#options.bip38();
    const format = results.current === null ? null : (signing?.format(results.current.id) ?? null);
    const rowLimit = bip38?.visibleRows(results.active);
    const canEncrypt =
      results.current !== null && bip38?.supportsResult(results.current.id) === true;
    bip38?.syncAvailability(canEncrypt);
    return {
      mode: results.mode,
      selected: results.selected,
      secretsRevealed: this.#revealed,
      windowStart: results.windowStart,
      windowSize: ResultWindow.sizeFor(results.mode),
      onWindowChange: (start: number) => {
        results.moveWindow(start);
        this.render();
        view.scrollResultWindowIntoView();
      },
      onSelectionChange: (index: number, checked: boolean) => {
        results.select(index, checked);
        this.updateBulkActions();
      },
      canSignMessages: format !== null,
      onSignMessage: (index: number, address: string) => {
        if (results.current !== null)
          signing?.open(results.current, results.active, "main", index, address);
      },
      encryptedBip38: bip38?.encryptedKeys(results.active) ?? new Map<number, string>(),
      ...(rowLimit === undefined ? {} : { rowLimit }),
    };
  }

  #field(scope: "summary" | "row", key: string, index?: number): ResultField | undefined {
    const results = this.#options.results;
    const result = results.current;
    if (result === null) return undefined;
    if (scope === "row" && key === "bip38EncryptedKey" && index !== undefined) {
      const value = this.#options.bip38()?.encryptedKey(results.active, index);
      return value === undefined
        ? undefined
        : {
            key,
            label: "Encrypted private key · BIP38",
            value,
            secret: true,
          };
    }
    if (scope === "summary")
      return [...result.basicSummary, ...result.summary].find((field) => field.key === key);
    const row = result.rows.find((candidate) => candidate.index === index);
    return row === undefined
      ? undefined
      : displayedFields(row, "advanced").find((field) => field.key === key);
  }

  #export(button: HTMLButtonElement, action: unknown, download: boolean): void {
    const { results, view } = this.#options;
    if (results.current === null) return;
    const context = {
      adapter: this.#options.adapter(),
      result: results.current,
      selected: results.selected,
      mode: results.mode,
      format: view.exportFormat.value,
    };
    if (download)
      void this.#exports.downloadRows(button, action, context, () => this.updateBulkActions());
    else void this.#exports.copyRows(button, action, context);
  }

  #installNavigation(): void {
    const { view, results } = this.#options;
    view.toggleResultSecrets.addEventListener("click", () => this.setRevealed(!this.#revealed));
    const setMode = (mode: DisplayMode): void => {
      results.setMode(mode);
      view.updateMode(mode);
      this.render();
    };
    view.modeBasic.addEventListener("click", () => setMode("basic"));
    view.modeAdvanced.addEventListener("click", () => setMode("advanced"));
    new ResultTabNavigation({
      topLevel: [
        [view.resultReceiveTab, "receive"],
        [view.resultChangeTab, "change"],
        [view.resultCoinJoinTab, "coinjoin"],
      ],
      coinJoinBranches: [
        [view.resultCoinJoinExternalTab, "coinjoin-external"],
        [view.resultCoinJoinInternalTab, "coinjoin-internal"],
      ],
      activateTopLevel: (tab) => this.activate(tab === "coinjoin" ? results.coinJoinBranch : tab),
      activateBranch: (branch) => this.activate(branch),
      branchEnabled: (branch) => view.resultBranchEnabled(branch),
      focusBranch: (branch) => view.focusResultBranch(branch),
    });
    for (const [button, choice] of [
      [view.selectAllButton, "all"],
      [view.selectNoneButton, "none"],
      [view.selectInvertButton, "invert"],
    ] as const) {
      button.addEventListener("click", () => {
        results.selectRows(choice);
        this.render();
      });
    }
    view.exportFormat.addEventListener("change", () => this.updateBulkActions());
  }

  #installExports(): void {
    const { view, results } = this.#options;
    new AccountExportController({
      document: view.document,
      buttons: view.descriptorButtons,
      result: () => results.current,
      secretsRevealed: () => this.#revealed,
      copyText: this.#exports.copyText,
      downloadText: this.#options.downloadText,
      showError: (message) => view.showError(message),
      showStatus: (message) => view.showStatus(message),
    });
    view.copyWatchOnlyButton.addEventListener("click", () => {
      const watchOnly = results.current?.watchOnly;
      if (watchOnly !== undefined)
        void this.#exports.copyText(view.copyWatchOnlyButton, () => watchOnly.text, true);
    });
    view.downloadWatchOnlyButton.addEventListener("click", () => {
      const watchOnly = results.current?.watchOnly;
      if (watchOnly === undefined) return;
      if (!this.#revealed) {
        view.showError("Show privacy-sensitive values before downloading a watch-only export.");
        return;
      }
      this.#options.downloadText(watchOnly.text, watchOnly.fileName, watchOnly.mimeType);
      view.showStatus(
        `Created ${watchOnly.fileName}. Treat it as private wallet metadata even though it cannot spend.`,
      );
    });
    view.document.addEventListener("click", (event) => {
      const action = view.documentActionFrom(event.target);
      if (action === null) return;
      if (action.kind === "bulk" || action.kind === "download") {
        this.#export(action.button, action.action, action.kind === "download");
        return;
      }
      const field = this.#field(action.scope, action.fieldKey, action.rowIndex);
      if (field === undefined) view.showError("The requested field is no longer available.");
      else void this.#exports.copyText(action.button, () => field.value, field.secret);
    });
  }
}
