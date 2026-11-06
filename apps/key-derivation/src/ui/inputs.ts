import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { DerivationInput, type SharedDerivationParameters } from "@ckd/coins/derivation-input.js";
import type { CoinAdapter, CoinFamily } from "@ckd/coins/registry-base.js";

/** Supplemental Deriver workspace; null selects ordinary address derivation. */
export type DerivationFeatureTab = "silent-payment" | "bip85" | "coinjoin" | null;

export interface CoinMetadataRegistry {
  COIN_FAMILIES: readonly CoinFamily[];
  getAdapterFamilyId(adapter: CoinAdapter): string;
  getCoinFamily(id: string): CoinFamily;
}

export interface DerivationControls {
  coin: HTMLSelectElement;
  protocolTabs: HTMLElement;
  legacyMobileField: HTMLElement;
  includeLegacyMobile: HTMLInputElement;
  network: HTMLSelectElement;
  networkField: HTMLElement;
  accountField: HTMLElement;
  accountLabel: HTMLLabelElement;
  account: HTMLInputElement;
  branchField: HTMLElement;
  branchLabel: HTMLLabelElement;
  branchInput: HTMLInputElement;
  branchSelect: HTMLSelectElement;
  changeField: HTMLElement;
  changeHelp: HTMLElement;
  includeChange: HTMLInputElement;
  coinJoinField: HTMLElement;
  includeCoinJoin: HTMLInputElement;
  coinJoinHelp: HTMLElement;
  startLabel: HTMLLabelElement;
  start: HTMLInputElement;
  countLabel: HTMLLabelElement;
  count: HTMLInputElement;
  preview: HTMLElement;
}

import type { DerivationParameters as DerivationControlValues } from "@ckd/coins/derivation-request.js";

export type { DerivationControlValues };

export type SharedDerivationControlValues = SharedDerivationParameters;

/** Compatibility entry for shared library admission of remembered settings. */
export const applySharedDerivationControls = DerivationInput.shared.bind(DerivationInput);

/** Native control rendering and translation; all numeric/profile rules belong to DerivationInput. */
export class DerivationControlsView {
  static #setNumeric(input: HTMLInputElement, value: number, max = MAX_BIP32_INDEX, min = 0): void {
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
  }

  static populateCoinSelect(select: HTMLSelectElement, registry: CoinMetadataRegistry): void {
    select.replaceChildren();
    for (const family of registry.COIN_FAMILIES) {
      const option = document.createElement("option");
      option.value = family.id;
      option.textContent = family.label;
      select.append(option);
    }
    // Firefox can restore an earlier select value while opening a local HTML
    // file. The build's ordered registry defines the deterministic default.
    select.selectedIndex = 0;
    select.value = registry.COIN_FAMILIES[0]?.id ?? "";
  }

  static #renderProtocolTabs(
    adapter: CoinAdapter,
    controls: DerivationControls,
    registry: CoinMetadataRegistry,
  ): void {
    const featureTabs = [
      ...controls.protocolTabs.querySelectorAll<HTMLButtonElement>("[data-feature-tab]"),
    ];
    controls.protocolTabs.replaceChildren();
    const family = registry.getCoinFamily(registry.getAdapterFamilyId(adapter));
    const showHidden = controls.includeLegacyMobile.checked;
    for (const variant of family.adapters.filter(
      (candidate) => !candidate.hiddenByDefault || showHidden || candidate.id === adapter.id,
    )) {
      const button = document.createElement("button");
      const selected = variant.id === adapter.id;
      button.type = "button";
      button.className = `protocol-tab primary-mode-tab${selected ? " active" : ""}`;
      button.dataset.adapterId = variant.id;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
      button.style.whiteSpace = "pre-line";
      button.textContent = variant.variantLabel;
      controls.protocolTabs.append(button);
    }
    controls.protocolTabs.append(...featureTabs);
  }

  /** An optional feature tab (Silent Payments, Child seeds, CoinJoin) is shown only while its checkbox is ticked. */
  static syncFeatureTabVisibility(checkbox: HTMLInputElement, tab: HTMLButtonElement): void {
    tab.hidden = checkbox.disabled || !checkbox.checked;
  }

  /**
   * Marks the selected entry of a "Derivation type" tab list: the tab of the active feature, or the
   * adapter tab when no feature is active. The original and the derived child wallet both use it.
   */
  static markSelectedProtocolTab(
    protocolTabs: HTMLElement,
    adapterId: string,
    feature: string | null,
  ): void {
    for (const button of protocolTabs.querySelectorAll<HTMLButtonElement>(".protocol-tab")) {
      const selected =
        feature === null
          ? button.dataset.adapterId === adapterId
          : button.dataset.featureTab === feature;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-checked", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  }

  static configureControls(
    adapter: CoinAdapter,
    controls: DerivationControls,
    registry: CoinMetadataRegistry,
    remembered?: DerivationControlValues,
  ): void {
    const defaults = adapter.defaults;
    const limits = DerivationInput.limits(adapter);
    const values: DerivationControlValues = remembered ?? {
      ...defaults,
      includeChange: false,
      includeCoinJoin: false,
    };
    controls.coin.value = registry.getAdapterFamilyId(adapter);
    const family = registry.getCoinFamily(registry.getAdapterFamilyId(adapter));
    controls.legacyMobileField.hidden = !family.adapters.some(
      ({ id }) => id === "dash-legacy-mobile",
    );
    if (adapter.id === "dash-legacy-mobile") controls.includeLegacyMobile.checked = true;
    DerivationControlsView.#renderProtocolTabs(adapter, controls, registry);
    controls.network.replaceChildren();
    for (const network of ["mainnet", "testnet"] as const) {
      const option = document.createElement("option");
      option.value = network;
      option.textContent = network === "mainnet" ? "Mainnet" : "Testnet";
      controls.network.append(option);
    }
    controls.network.value = values.network;
    controls.network.disabled = !adapter.networkControl;
    controls.networkField.classList.toggle("control-disabled", !adapter.networkControl);
    controls.accountField.hidden = adapter.accountControl === false;
    controls.account.disabled = adapter.accountControl === false;
    controls.accountLabel.textContent = adapter.controlLabels?.account ?? "Account";
    controls.startLabel.textContent = adapter.controlLabels?.start ?? "Start index";
    controls.countLabel.textContent = adapter.controlLabels?.count ?? "Number of results";
    DerivationControlsView.#setNumeric(controls.account, values.account, limits.account);
    DerivationControlsView.#setNumeric(controls.start, values.start, limits.start);
    DerivationControlsView.#setNumeric(
      controls.count,
      values.count,
      limits.start + 1,
      limits.minimumCount,
    );

    const branch = adapter.branchControl;
    controls.branchField.hidden = branch === undefined;
    if (branch !== undefined) {
      controls.branchLabel.textContent = branch.label;
      if (branch.options === undefined) {
        controls.branchSelect.hidden = true;
        controls.branchInput.hidden = false;
        controls.branchLabel.htmlFor = controls.branchInput.id;
        DerivationControlsView.#setNumeric(controls.branchInput, values.branch, branch.max);
      } else {
        controls.branchInput.hidden = true;
        controls.branchSelect.hidden = false;
        controls.branchLabel.htmlFor = controls.branchSelect.id;
        controls.branchSelect.replaceChildren();
        for (const item of branch.options) {
          const option = document.createElement("option");
          option.value = String(item.value);
          option.textContent = item.label;
          controls.branchSelect.append(option);
        }
        controls.branchSelect.value = String(values.branch);
      }
    }
    controls.changeField.hidden = adapter.addressBranches === undefined;
    controls.changeHelp.textContent =
      adapter.addressBranches?.help ??
      "Uses the standard internal branch /1 and shows it in a separate result tab.";
    controls.includeChange.checked = adapter.addressBranches !== undefined && values.includeChange;
    controls.coinJoinField.hidden = adapter.coinJoin === undefined;
    controls.includeCoinJoin.checked = adapter.coinJoin !== undefined && values.includeCoinJoin;
    DerivationControlsView.updatePathPreview(adapter, controls);
  }

  /** Translate native controls only; the library admits every derivation setting. */
  static readControls(adapter: CoinAdapter, controls: DerivationControls): DerivationControlValues {
    return DerivationInput.fromFields(adapter, {
      network: controls.network.value,
      account: controls.account.value,
      branch:
        adapter.branchControl?.options === undefined
          ? controls.branchInput.value
          : controls.branchSelect.value,
      start: controls.start.value,
      count: controls.count.value,
      includeChange: controls.includeChange.checked,
      includeCoinJoin: controls.includeCoinJoin.checked,
    });
  }

  static updatePathPreview(adapter: CoinAdapter, controls: DerivationControls): void {
    try {
      const values = DerivationControlsView.readControls(adapter, controls);
      const { includeChange, ...input } = values;
      const receivePath = adapter.pathPreview(input);
      if (includeChange && adapter.addressBranches !== undefined) {
        const changePath = adapter.pathPreview({
          ...input,
          branch: adapter.addressBranches.change,
        });
        controls.preview.textContent = `Receive: ${receivePath} · Change: ${changePath}`;
      } else {
        controls.preview.textContent = receivePath;
      }
      if (adapter.coinJoin !== undefined) {
        const { external, internal } = adapter.coinJoin.pathPreview(input);
        controls.coinJoinHelp.textContent = `${external} · ${internal}`;
      }
    } catch {
      controls.preview.textContent = "Enter valid integer controls to preview the path.";
      if (adapter.coinJoin !== undefined) {
        controls.coinJoinHelp.textContent =
          "Enter valid integer controls to preview the Dash Mobile CoinJoin · DIP9 paths.";
      }
    }
  }
}

/** Compatibility entry for existing native control callers. */
export const populateCoinSelect =
  DerivationControlsView.populateCoinSelect.bind(DerivationControlsView);

/** Compatibility entry for existing native control callers. */
export const syncFeatureTabVisibility =
  DerivationControlsView.syncFeatureTabVisibility.bind(DerivationControlsView);

/** Compatibility entry for existing native control callers. */
export const markSelectedProtocolTab =
  DerivationControlsView.markSelectedProtocolTab.bind(DerivationControlsView);

/** Compatibility entry for existing native control callers. */
export const configureControls =
  DerivationControlsView.configureControls.bind(DerivationControlsView);

/** Compatibility entry for existing native control callers. */
export const readControls = DerivationControlsView.readControls.bind(DerivationControlsView);

/** Compatibility entry for existing native control callers. */
export const updatePathPreview =
  DerivationControlsView.updatePathPreview.bind(DerivationControlsView);
