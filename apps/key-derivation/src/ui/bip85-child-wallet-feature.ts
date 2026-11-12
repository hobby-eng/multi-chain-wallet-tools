import { AccountExportController } from "./account-export-controller.js";
import type { CoinAdapter } from "@ckd/coins/registry.js";
import { CoinFamilyCatalog } from "@ckd/coins/registry-base.js";
import type { DerivationResult, DisplayMode, ResultField } from "@ckd/core/types.js";
import { displayedFields, inspectSelectedRows } from "@ckd/export/formatter.js";
import {
  configureControls,
  markSelectedProtocolTab,
  populateCoinSelect,
  readControls,
  syncFeatureTabVisibility,
  updatePathPreview,
  type CoinMetadataRegistry,
  type DerivationControlValues,
  type DerivationControls,
} from "./inputs.js";
import type { ResultBranch } from "./result-branches.js";
import { DerivationStream } from "@ckd/coins/derivation-stream.js";
import { DerivationErrorText } from "./derivation-error-text.js";
import { renderResults, updateSecretVisibility } from "./results.js";
import { ResultSelection } from "@ckd/ui/result-selection.js";
import { Bip85ChildDerivation } from "./bip85-child-derivation.js";
import { AutomaticDerivationScheduler } from "./automatic-derivation.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";
import { ResultWindow } from "@ckd/ui/result-window.js";
import { clearRenderedSecrets } from "./secrets.js";

/** Element ID prefix of the child workspace (see CHILD_WALLET_ID_PREFIX in tooling/profile-template.mjs). */
const CHILD_WALLET_ID_PREFIX = "bip85-wallet-";
const CHILD_WALLET_REFRESH_DELAY_MS = 300;

import type { ResultExportContext } from "./result-export-controller.js";
import type { Bip85ChildWalletOptions } from "./bip85-child-wallet-types.js";
import { EmbeddedDerivation, EmbeddedDerivationError } from "@ckd/coins/embedded-derivation.js";
export type { Bip85ChildWalletOptions } from "./bip85-child-wallet-types.js";

/** Owns the embedded child wallet and its native bindings; derivation stays in the shared owner. */
export class Bip85ChildWallet {
  readonly #options: Bip85ChildWalletOptions;
  /** Native control used by the parent to open this optional workspace. */
  readonly openButton: HTMLButtonElement | null;
  readonly #refresh: AutomaticDerivationScheduler;
  #workspace;
  #results;
  #summary;
  #notices;
  #list;
  #branchTabs;
  #error;
  #status;
  #deriveButton;
  #basicButton;
  #advancedButton;
  #toggleSecrets;
  #selectedCount;
  #exportFormat;
  #selectAll;
  #selectNone;
  #selectInvert;
  #accountExport;
  #accountExportDialog;
  #accountExportDescription;
  #adapter: CoinAdapter | null;
  #controls: DerivationControls | null;
  #mode: DisplayMode;
  #windowStart;
  #selected;
  #activeBranch: ResultBranch;
  #branchResults;
  #revision;
  #includeSilentPayment;
  #silentPaymentTab;
  #silentPaymentPanel;
  #silentPaymentSecretSlot;
  #secretsToggleHome;
  #childPassphrase;
  #derivation;
  #silentPaymentActive;
  #silentPayment;
  #registry: CoinMetadataRegistry;
  readonly #element = <T extends Element>(selector: string): T | null =>
    this.#options.document.querySelector<T>(selector);
  /** Composes native fields with shared result, export and secret-lifetime owners. */
  constructor(options: Bip85ChildWalletOptions) {
    this.#options = options;
    this.#refresh = new AutomaticDerivationScheduler(
      options.document.defaultView ?? window,
      CHILD_WALLET_REFRESH_DELAY_MS,
    );
    this.#workspace = this.#element<HTMLElement>("#bip85-wallet-workspace");
    this.#results = this.#element<HTMLElement>("#bip85-wallet-results");
    this.#summary = this.#element<HTMLElement>("#bip85-wallet-summary");
    this.#notices = this.#element<HTMLElement>("#bip85-wallet-notices");
    this.#list = this.#element<HTMLElement>("#bip85-wallet-list");
    this.#branchTabs = this.#element<HTMLElement>("#bip85-wallet-branch-tabs");
    this.#error = this.#element<HTMLElement>("#bip85-wallet-error");
    this.#status = this.#element<HTMLElement>("#bip85-wallet-status");
    this.#deriveButton = this.#element<HTMLButtonElement>("#derive-bip85-wallet");
    this.#basicButton = this.#element<HTMLButtonElement>("#bip85-wallet-basic");
    this.#advancedButton = this.#element<HTMLButtonElement>("#bip85-wallet-advanced");
    this.#toggleSecrets = this.#element<HTMLButtonElement>("#bip85-wallet-toggle-secrets");
    this.#selectedCount = this.#element<HTMLElement>("#bip85-wallet-selected-count");
    this.#exportFormat = this.#element<HTMLSelectElement>("#bip85-wallet-export-format");
    this.#selectAll = this.#element<HTMLButtonElement>("#bip85-wallet-select-all");
    this.#selectNone = this.#element<HTMLButtonElement>("#bip85-wallet-select-none");
    this.#selectInvert = this.#element<HTMLButtonElement>("#bip85-wallet-select-invert");
    this.#accountExport = this.#element<HTMLElement>("#bip85-wallet-account-export");
    this.#accountExportDialog = this.#element<HTMLDialogElement>(
      "#bip85-wallet-account-export-dialog",
    );
    this.#accountExportDescription = this.#element<HTMLElement>(
      "#bip85-wallet-account-export-description",
    );
    this.#adapter = null;
    this.#controls = null;
    this.#mode = "basic";
    this.#windowStart = 0;
    this.#selected = new Set<number>();
    this.#activeBranch = "receive";
    this.#branchResults = new Map<ResultBranch, DerivationResult>();
    this.#revision = 0;
    this.#includeSilentPayment = this.#element<HTMLInputElement>(
      `#${CHILD_WALLET_ID_PREFIX}include-silent-payment`,
    );
    this.#silentPaymentTab = this.#element<HTMLButtonElement>(
      `#${CHILD_WALLET_ID_PREFIX}silent-payment-tab`,
    );
    this.#silentPaymentPanel = this.#element<HTMLElement>(
      `#${CHILD_WALLET_ID_PREFIX}silent-payment-panel`,
    );
    this.#silentPaymentSecretSlot = this.#element<HTMLElement>(
      `#${CHILD_WALLET_ID_PREFIX}silent-payment-secret-control-slot`,
    );
    this.#secretsToggleHome = this.#toggleSecrets?.parentElement ?? null;
    this.#childPassphrase = (): string =>
      this.#element<HTMLInputElement>("#bip85-child-passphrase")?.value ?? "";
    this.#derivation = new Bip85ChildDerivation(this.#options, this.#childPassphrase, () => {
      queueMicrotask(() => this.#options.showError(DerivationErrorText.CLEANUP_FAILURE));
    });
    this.#silentPaymentActive = false;
    this.#silentPayment =
      this.#includeSilentPayment === null
        ? undefined
        : this.#options.installSilentPaymentFeature?.({
            document: this.#options.document,
            idPrefix: CHILD_WALLET_ID_PREFIX,
            mnemonic: () => this.#options.mnemonic() ?? "",
            passphrase: this.#childPassphrase,
            mnemonicToSeed: (...args) => this.#options.mnemonicToSeed(...args),
            createWorker: () => this.#options.createWorker(),
            isActive: () => this.#silentPaymentActive && this.#workspace?.hidden === false,
            mnemonicMayBeComplete: () => this.#options.mnemonic() !== null,
            cryptoReady: () => this.#options.cryptoReady(),
          });
    this.#registry = {
      COIN_FAMILIES: this.#options.coinFamilies,
      getAdapterFamilyId: (adapter) => this.#options.getAdapterFamilyId(adapter),
      getCoinFamily: (id) => new CoinFamilyCatalog(this.#options.coinFamilies).get(id),
    };
    this.#bindFeatures();
    this.#bindResults();
    this.#bindAccount();
    this.openButton = this.#element<HTMLButtonElement>("#open-bip85-wallet");
  }
  readonly #createControls = (): DerivationControls | null => {
    const required = <T extends Element>(selector: string): T | null => this.#element<T>(selector);
    const nested = {
      coin: required<HTMLSelectElement>("#bip85-wallet-coin"),
      protocolTabs: required<HTMLElement>("#bip85-wallet-tabs"),
      legacyMobileField: required<HTMLElement>("#bip85-wallet-legacy-field"),
      includeLegacyMobile: required<HTMLInputElement>("#bip85-wallet-legacy-toggle"),
      network: required<HTMLSelectElement>("#bip85-wallet-network"),
      networkField: required<HTMLElement>("#bip85-wallet-network-field"),
      accountField: required<HTMLElement>("#bip85-wallet-account-field"),
      accountLabel: required<HTMLLabelElement>("#bip85-wallet-account-label"),
      account: required<HTMLInputElement>("#bip85-wallet-account"),
      branchField: required<HTMLElement>("#bip85-wallet-branch-field"),
      branchLabel: required<HTMLLabelElement>("#bip85-wallet-branch-label"),
      branchInput: required<HTMLInputElement>("#bip85-wallet-branch-input"),
      branchSelect: required<HTMLSelectElement>("#bip85-wallet-branch-select"),
      changeField: required<HTMLElement>("#bip85-wallet-change-field"),
      changeHelp: required<HTMLElement>("#bip85-wallet-change-help"),
      includeChange: required<HTMLInputElement>("#bip85-wallet-include-change"),
      coinJoinField: required<HTMLElement>("#bip85-wallet-coinjoin-field"),
      includeCoinJoin: required<HTMLInputElement>("#bip85-wallet-include-coinjoin"),
      coinJoinHelp: required<HTMLElement>("#bip85-wallet-coinjoin-help"),
      startLabel: required<HTMLLabelElement>("#bip85-wallet-start-label"),
      start: required<HTMLInputElement>("#bip85-wallet-start"),
      countLabel: required<HTMLLabelElement>("#bip85-wallet-count-label"),
      count: required<HTMLInputElement>("#bip85-wallet-count"),
      preview: required<HTMLElement>("#bip85-wallet-path"),
    };
    return this.#completeControls(nested) ? nested : null;
  };
  readonly #completeControls = (controls: {
    [Key in keyof DerivationControls]: DerivationControls[Key] | null;
  }): controls is DerivationControls =>
    Object.values(controls).every((element) => element !== null);
  readonly #clearResults = (): void => {
    try {
      this.#options.invalidateExports?.();
    } catch {
      queueMicrotask(() => this.#options.showError(DerivationErrorText.CLEANUP_FAILURE));
    }
    using _features = {
      [Symbol.dispose]: () => {
        try {
          this.#silentPayment?.clear();
        } finally {
          this.#updateActions();
        }
      },
    };
    using _results = {
      [Symbol.dispose]: () => {
        DerivationStream.discard(this.#branchResults);
        this.#selected.clear();
        this.#windowStart = 0;
        if (this.#results !== null) this.#results.hidden = true;
        if (this.#summary !== null) clearRenderedSecrets(this.#summary);
        this.#notices?.replaceChildren();
        if (this.#list !== null) clearRenderedSecrets(this.#list);
        this.#branchTabs?.replaceChildren();
      },
    };
    this.#refresh.cancel();
    this.#revision += 1;
    this.#derivation.wipe();
    if (this.#options.messageSigning?.activeSource() === "bip85")
      this.#options.messageSigning.close();
  };
  readonly #selectSilentPayment = (active: boolean): void => {
    this.#silentPaymentActive = active && this.#silentPayment !== undefined;
    this.#workspace?.classList.toggle("nested-feature-active", this.#silentPaymentActive);
    if (this.#silentPaymentPanel !== null)
      this.#silentPaymentPanel.hidden = !this.#silentPaymentActive;
    if (this.#controls !== null && this.#adapter !== null) {
      markSelectedProtocolTab(
        this.#controls.protocolTabs,
        this.#adapter.id,
        this.#silentPaymentActive ? "silent-payment" : null,
      );
    }
    // Like the original wallet, keep "Show private keys" next to the panel that is in view.
    if (this.#toggleSecrets !== null) {
      if (this.#silentPaymentActive) this.#silentPaymentSecretSlot?.append(this.#toggleSecrets);
      else this.#secretsToggleHome?.prepend(this.#toggleSecrets);
    }
  };
  readonly #syncSilentPayment = (): void => {
    if (this.#includeSilentPayment === null || this.#silentPaymentTab === null) return;
    if (this.#silentPayment === undefined) {
      this.#includeSilentPayment.checked = false;
      this.#includeSilentPayment.disabled = true;
      const label = this.#includeSilentPayment.closest<HTMLElement>("label");
      if (label !== null) label.hidden = true;
    }
    syncFeatureTabVisibility(this.#includeSilentPayment, this.#silentPaymentTab);
    if (!this.#includeSilentPayment.checked && this.#silentPaymentActive) {
      this.#selectSilentPayment(false);
      this.#scheduleRefresh();
    }
  };
  readonly #field = (
    result: DerivationResult,
    scope: "summary" | "row",
    fieldKey: string,
    rowIndex?: number,
  ): ResultField | undefined => {
    if (scope === "summary")
      return [...result.basicSummary, ...result.summary].find(({ key }) => key === fieldKey);
    const row = result.rows.find(({ index }) => index === rowIndex);
    return row === undefined
      ? undefined
      : displayedFields(row, "advanced").find(({ key }) => key === fieldKey);
  };
  readonly #updateActions = (): void => {
    const result = this.#branchResults.get(this.#activeBranch);
    const adapter = this.#adapter;
    if (this.#selectedCount !== null) this.#selectedCount.textContent = String(this.#selected.size);
    const buttons = this.#results?.querySelectorAll<HTMLButtonElement>(
      "[data-bip85-bulk],[data-bip85-download]",
    );
    for (const button of buttons ?? []) {
      const action = button.dataset.bip85Bulk ?? button.dataset.bip85Download;
      if (result === undefined || adapter === null || this.#selected.size === 0) {
        button.disabled = true;
        continue;
      }
      try {
        const inspection = inspectSelectedRows(adapter, result, this.#selected, this.#mode, action);
        button.disabled =
          inspection.valueCount === 0 ||
          (inspection.containsSecret && !this.#options.secretsRevealed());
      } catch (cause) {
        button.disabled = true;
        this.#options.showError(DerivationErrorText.of(cause));
      }
    }
    if (this.#selectAll !== null) this.#selectAll.disabled = result === undefined;
    if (this.#selectNone !== null)
      this.#selectNone.disabled = result === undefined || this.#selected.size === 0;
    if (this.#selectInvert !== null) this.#selectInvert.disabled = result === undefined;
    const descriptors = result?.accountDescriptors;
    if (this.#accountExport !== null) this.#accountExport.hidden = descriptors === undefined;
    if (descriptors === undefined && this.#accountExportDialog?.open === true)
      this.#accountExportDialog.close();
    if (this.#accountExportDescription !== null)
      this.#accountExportDescription.textContent =
        result === undefined || descriptors === undefined
          ? ""
          : `${result.title} · ${result.networkLabel} · account ${descriptors.accountPath}`;
    for (const button of this.#accountExportDialog?.querySelectorAll<HTMLButtonElement>(
      "[data-bip85-descriptor]",
    ) ?? []) {
      AccountExportController.updateButton(
        button,
        button.dataset.bip85Descriptor,
        descriptors !== undefined,
        this.#options.secretsRevealed(),
      );
    }
  };
  readonly #render = (): void => {
    const result = this.#branchResults.get(this.#activeBranch);
    if (
      result === undefined ||
      this.#summary === null ||
      this.#notices === null ||
      this.#list === null ||
      this.#results === null
    )
      return;
    renderResults(this.#summary, this.#list, this.#notices, result, {
      mode: this.#mode,
      selected: this.#selected,
      secretsRevealed: this.#options.secretsRevealed(),
      windowStart: this.#windowStart,
      windowSize: ResultWindow.sizeFor(this.#mode),
      onWindowChange: (start) => {
        this.#windowStart = start;
        this.#render();
      },
      onSelectionChange: (index, isSelected) => {
        if (isSelected) this.#selected.add(index);
        else this.#selected.delete(index);
        this.#updateActions();
      },
      canSignMessage: (addressKey) =>
        (this.#options.messageSigning?.offers(result.id, addressKey).length ?? 0) > 0,
      onSignMessage: (index, address, addressKey) => {
        this.#options.messageSigning?.open(
          result,
          this.#activeBranch,
          "bip85",
          index,
          address,
          addressKey,
        );
      },
      encryptedBip38: new Map(),
    });
    updateSecretVisibility(this.#results, this.#options.secretsRevealed());
    this.#results.hidden = false;
    this.#updateActions();
  };
  readonly #renderBranches = (): void => {
    if (this.#branchTabs === null) return;
    const entries = [...this.#branchResults.keys()];
    this.#branchTabs.hidden = entries.length < 2;
    this.#branchTabs.replaceChildren(
      ...entries.map((branch) => {
        const button = this.#options.document.createElement("button");
        button.type = "button";
        button.className = `result-branch-tab${branch === this.#activeBranch ? " active" : ""}`;
        button.textContent =
          branch === "receive"
            ? "Receive"
            : branch === "change"
              ? "Change"
              : branch === "coinjoin-external"
                ? "CoinJoin · External"
                : "CoinJoin · Internal";
        button.addEventListener("click", () => {
          this.#activeBranch = branch;
          this.#windowStart = 0;
          this.#renderBranches();
          this.#render();
        });
        return button;
      }),
    );
  };
  readonly #scheduleRefresh = (): void => {
    if (this.#silentPaymentActive) {
      this.#silentPayment?.clear();
      this.#silentPayment?.scheduleRefresh();
      return;
    }
    this.#refresh.schedule(
      () => this.#workspace?.hidden === false && this.#options.cryptoReady(),
      () => void this.#deriveAddresses(),
    );
  };
  readonly #configure = (next: CoinAdapter): void => {
    if (this.#controls === null) return;
    this.#adapter = next;
    this.#clearResults();
    configureControls(next, this.#controls, this.#registry);
    this.#scheduleRefresh();
  };
  readonly #initialize = (): void => {
    if (this.#controls !== null) return;
    this.#controls = this.#createControls();
    if (this.#controls === null) return;
    populateCoinSelect(this.#controls.coin, this.#registry);
    const initialFamily = this.#options.coinFamilies[0];
    if (initialFamily === undefined) return;
    this.#configure(this.#options.getDefaultCoinAdapter(initialFamily.id));
    this.#controls.coin.addEventListener("change", () => {
      if (this.#controls === null) return;
      this.#selectSilentPayment(false);
      this.#configure(this.#options.getDefaultCoinAdapter(this.#controls.coin.value));
    });
    this.#controls.protocolTabs.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const id = event.target.closest<HTMLButtonElement>("[data-adapter-id]")?.dataset.adapterId;
      if (id === undefined) return;
      this.#selectSilentPayment(false);
      if (id !== this.#adapter?.id) this.#configure(this.#options.getCoinAdapter(id));
      else this.#scheduleRefresh();
    });
    for (const control of [
      this.#controls.network,
      this.#controls.account,
      this.#controls.branchInput,
      this.#controls.branchSelect,
      this.#controls.includeChange,
      this.#controls.includeCoinJoin,
      this.#controls.start,
      this.#controls.count,
    ]) {
      const refresh = (): void => {
        if (this.#adapter === null || this.#controls === null) return;
        this.#clearResults();
        updatePathPreview(this.#adapter, this.#controls);
        this.#scheduleRefresh();
      };
      control.addEventListener("input", refresh);
      // Some browsers only emit change for selects and checkboxes. Debouncing keeps
      // the input/change pair to one derivation while covering both event models.
      control.addEventListener("change", refresh);
    }
  };
  readonly #deriveAddresses = async (): Promise<void> => {
    if (this.#adapter === null || this.#controls === null || this.#deriveButton === null) return;
    const requestedAdapter = this.#adapter;
    const requestedControls = this.#controls;
    if (!this.#options.cryptoReady()) {
      if (this.#error !== null) {
        this.#error.textContent = SELF_TEST_NOT_PASSED;
        this.#error.hidden = false;
      }
      return;
    }
    let input: DerivationControlValues;
    try {
      input = readControls(requestedAdapter, requestedControls);
      EmbeddedDerivation.admit(input.count);
    } catch (cause) {
      if (this.#error !== null) {
        this.#error.textContent =
          cause instanceof EmbeddedDerivationError
            ? `The embedded child-wallet view is limited to ${EmbeddedDerivation.maximumRows} results per branch.`
            : DerivationErrorText.of(cause);
        this.#error.hidden = false;
      }
      return;
    }
    if (this.#options.mnemonic() === null) return;
    this.#clearResults();
    const revision = this.#revision;
    if (this.#error !== null) this.#error.hidden = true;
    if (this.#status !== null) {
      this.#status.textContent = "Deriving child wallet results locally…";
      this.#status.hidden = false;
    }
    this.#deriveButton.disabled = true;
    try {
      const nextResults = await this.#derivation.derive(requestedAdapter, input);
      if (nextResults === undefined) return;
      if (revision !== this.#revision) {
        DerivationStream.discard(nextResults);
        return;
      }
      for (const [kind, result] of nextResults) {
        this.#branchResults.set(kind, result);
        for (const row of result.rows) this.#selected.add(row.index);
      }
      this.#activeBranch = nextResults.keys().next().value ?? "receive";
      this.#renderBranches();
      this.#render();
      if (this.#status !== null) {
        this.#status.textContent = `Derived ${input.count.toLocaleString()} result${input.count === 1 ? "" : "s"} per selected branch from the child seed.`;
      }
    } catch (cause) {
      if (revision !== this.#revision) return;
      this.#clearResults();
      if (this.#error !== null) {
        this.#error.textContent = DerivationErrorText.of(cause);
        this.#error.hidden = false;
      }
      if (this.#status !== null) this.#status.hidden = true;
    } finally {
      if (!this.#derivation.running) this.#deriveButton.disabled = false;
    }
  };
  readonly #deriveActive = async (): Promise<void> => {
    if (this.#silentPaymentActive) {
      this.#silentPayment?.derive();
      return;
    }
    await this.#deriveAddresses();
  };
  readonly #exportContext = (): ResultExportContext | null => {
    const result = this.#branchResults.get(this.#activeBranch);
    if (result === undefined || this.#adapter === null || this.#exportFormat === null) return null;
    return {
      adapter: this.#adapter,
      result,
      selected: this.#selected,
      mode: this.#mode,
      format: this.#exportFormat.value,
    };
  };
  #bindFeatures(): void {
    this.#includeSilentPayment?.addEventListener("change", this.#syncSilentPayment);
    this.#silentPaymentTab?.addEventListener("click", () => {
      if (this.#silentPayment === undefined) return;
      this.#clearResults();
      this.#selectSilentPayment(true);
      this.#silentPayment.derive();
    });
    this.#syncSilentPayment();
    this.#deriveButton?.addEventListener("click", () => void this.#deriveAddresses());
    this.#basicButton?.addEventListener("click", () => {
      this.#mode = "basic";
      this.#basicButton?.classList.add("active");
      this.#advancedButton?.classList.remove("active");
      this.#windowStart = 0;
      this.#render();
    });
    this.#advancedButton?.addEventListener("click", () => {
      this.#mode = "advanced";
      this.#advancedButton?.classList.add("active");
      this.#basicButton?.classList.remove("active");
      this.#windowStart = 0;
      this.#render();
    });
  }
  #bindResults(): void {
    this.#results?.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest<HTMLButtonElement>("[data-copy-field]");
        const result = this.#branchResults.get(this.#activeBranch);
        if (button === null || result === undefined) return;
        event.stopPropagation();
        const scope = button.dataset.copyScope;
        const fieldKey = button.dataset.copyField;
        if ((scope !== "summary" && scope !== "row") || fieldKey === undefined) return;
        const rowIndex =
          button.dataset.copyRow === undefined ? undefined : Number(button.dataset.copyRow);
        const field = this.#field(result, scope, fieldKey, rowIndex);
        if (field !== undefined)
          void this.#options.copyText(button, () => field.value, field.secret);
      },
      true,
    );
    this.#toggleSecrets?.addEventListener("click", () =>
      this.#options.setSecretsRevealed(!this.#options.secretsRevealed()),
    );
    this.#selectAll?.addEventListener("click", () => {
      const result = this.#branchResults.get(this.#activeBranch);
      if (result === undefined) return;
      this.#selected = ResultSelection.choose(
        "all",
        result.rows.map((row) => row.index),
      );
      this.#render();
    });
    this.#selectNone?.addEventListener("click", () => {
      this.#selected = ResultSelection.choose("none", []);
      this.#render();
    });
    this.#selectInvert?.addEventListener("click", () => {
      const result = this.#branchResults.get(this.#activeBranch);
      if (result === undefined) return;
      this.#selected = ResultSelection.choose(
        "invert",
        result.rows.map((row) => row.index),
        this.#selected,
      );
      this.#render();
    });
    this.#exportFormat?.addEventListener("change", this.#updateActions);
    this.#results?.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const bulkButton = event.target.closest<HTMLButtonElement>("[data-bip85-bulk]");
      const downloadButton = event.target.closest<HTMLButtonElement>("[data-bip85-download]");
      const context = this.#exportContext();
      if (context === null) return;
      if (bulkButton?.dataset.bip85Bulk !== undefined) {
        void this.#options.copyBulkFrom(bulkButton, bulkButton.dataset.bip85Bulk, context);
      } else if (downloadButton?.dataset.bip85Download !== undefined) {
        void this.#options.downloadRowsFrom(
          downloadButton,
          downloadButton.dataset.bip85Download,
          context,
          this.#updateActions,
        );
      }
    });
  }
  #bindAccount(): void {
    this.#element<HTMLButtonElement>("#bip85-wallet-open-account-export")?.addEventListener(
      "click",
      () => this.#accountExportDialog?.showModal(),
    );
    this.#element<HTMLButtonElement>("#bip85-wallet-close-account-export")?.addEventListener(
      "click",
      () => this.#accountExportDialog?.close(),
    );
    const accountExport = new AccountExportController({
      document: this.#options.document,
      buttons: {},
      formatSelector: "#bip85-wallet-account-export-format",
      result: () => this.#branchResults.get(this.#activeBranch) ?? null,
      secretsRevealed: () => this.#options.secretsRevealed(),
      copyText: (...args) => this.#options.copyText(...args),
      downloadText: (...args) => this.#options.downloadText(...args),
      showError: (message) => this.#options.showError(message),
      showStatus: (message) => this.#options.showStatus(message),
    });
    for (const button of this.#accountExportDialog?.querySelectorAll<HTMLButtonElement>(
      "[data-bip85-descriptor]",
    ) ?? []) {
      accountExport.bind(button, button.dataset.bip85Descriptor);
    }
  }
  /** Metadata of the selected child protocol, without deriving a result. */
  readonly adapter = () => this.#adapter;
  /** The complete native control set, or null when this workspace is absent. */
  readonly controls = () => this.#controls;
  /** Container the parent shows only while the child workspace is selected. */
  get workspace(): HTMLElement | null {
    return this.#workspace;
  }
  /** Revoke pending derivation/exports and release current child results. */
  readonly clear = this.#clearResults;
  /** Lazily populate the child controls using this build's metadata. */
  readonly initialize = this.#initialize;
  /** Delegate the selected address or Silent Payments operation after admission. */
  readonly derive = this.#deriveActive;
  /** Replace the pending edit timer; the shared scheduler rechecks readiness before starting. */
  readonly scheduleRefresh = this.#scheduleRefresh;
  /** Whether this owner currently holds any complete address branches. */
  readonly hasResults = () => this.#branchResults.size > 0;
  /** Repaint the active branch from its admitted shared result model. */
  readonly render = this.#render;
  /** Apply the parent's disclosure permission to the active child panel. */
  readonly setSecretsVisible = (revealed: boolean) => {
    if (this.#results !== null) updateSecretVisibility(this.#results, revealed);
    this.#silentPayment?.setSecretsVisible(revealed);
    if (this.#toggleSecrets !== null) {
      this.#toggleSecrets.textContent = revealed ? "Hide private keys" : "Show private keys";
      this.#toggleSecrets.setAttribute("aria-pressed", String(revealed));
    }
    this.#updateActions();
  };
  /** Cancel pending automatic starts in both child panels. */
  readonly cancelScheduledRefresh = () => {
    this.#refresh.cancel();
    this.#silentPayment?.cancelScheduledRefresh();
  };
  /** Return optional child features to their initial unselected state. */
  readonly resetFeatures = () => {
    if (this.#includeSilentPayment !== null) this.#includeSilentPayment.checked = false;
    this.#selectSilentPayment(false);
    this.#syncSilentPayment();
    this.#silentPayment?.reset();
  };
}
/** Compatibility installer; the class owns the original callback surface. */
export function installBip85ChildWallet(options: Bip85ChildWalletOptions) {
  return new Bip85ChildWallet(options);
}
