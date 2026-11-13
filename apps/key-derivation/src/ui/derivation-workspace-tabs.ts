import type { CoinAdapter } from "@ckd/coins/registry.js";
import {
  markSelectedProtocolTab,
  offerFeatureOption,
  readControls,
  silentPaymentsOffered,
  syncFeatureTabVisibility,
  type DerivationFeatureTab,
} from "./inputs.js";
import type { KeyDerivationView } from "./view.js";

interface DerivationWorkspaceTabsOptions {
  view: KeyDerivationView;
  adapter(): CoinAdapter;
  hasResults(): boolean;
  silentPaymentAvailable: boolean;
  activate(feature: Exclude<DerivationFeatureTab, null>): void;
  schedule(): void;
  placeDisclosure(): void;
}

/** Owns supplemental tab selection and presentation; adapter path facts come from the library. */
export class DerivationWorkspaceTabs {
  readonly #options: DerivationWorkspaceTabsOptions;
  readonly #silent;
  readonly #bip85;
  readonly #coinJoin;
  readonly #derivationPanel;
  readonly #mainResults;
  #active: DerivationFeatureTab = null;

  constructor(options: DerivationWorkspaceTabsOptions) {
    this.#options = options;
    const document = options.view.document;
    // Optional build modules and test/embedding hosts need not provide every panel.
    const query = <T extends Element>(selector: string): T | null =>
      document.querySelector?.<T>(selector) ?? null;
    this.#silent = {
      checkbox: query<HTMLInputElement>("#include-silent-payment"),
      tab: query<HTMLButtonElement>("#silent-payment-tab"),
      panel: query<HTMLElement>("#silent-payment-panel"),
    };
    this.#bip85 = {
      checkbox: query<HTMLInputElement>("#include-bip85"),
      tab: query<HTMLButtonElement>("#bip85-tab"),
      panel: query<HTMLElement>("#bip85-panel"),
    };
    this.#coinJoin = {
      checkbox: options.view.controls.includeCoinJoin,
      tab: query<HTMLButtonElement>("#coinjoin-tab"),
    };
    this.#derivationPanel = query<HTMLElement>("#derivation-panel");
    this.#mainResults = query<HTMLElement>("#results");
    for (const [feature, controls] of [
      ["silent-payment", this.#silent],
      ["bip85", this.#bip85],
      ["coinjoin", this.#coinJoin],
    ] as const) {
      controls.checkbox?.addEventListener("change", () => this.#sync(feature, controls));
      controls.tab?.addEventListener("click", () => {
        if (feature === "silent-payment" && !this.#silentPaymentOffered()) return;
        if (feature === "coinjoin" && options.adapter().coinJoin === undefined) return;
        options.activate(feature);
      });
    }
  }

  /** The selected workspace is public UI state and contains no wallet material. */
  get active(): DerivationFeatureTab {
    return this.#active;
  }

  /** Present a selected workspace after the host has revoked the preceding operation. */
  select(next: DerivationFeatureTab): void {
    this.#active = next;
    const supplemental = next === "silent-payment" || next === "bip85";
    this.#derivationPanel?.classList.toggle("feature-tab-active", supplemental);
    if (this.#silent.panel !== null) this.#silent.panel.hidden = next !== "silent-payment";
    if (this.#bip85.panel !== null) this.#bip85.panel.hidden = next !== "bip85";
    const { view } = this.#options;
    markSelectedProtocolTab(view.controls.protocolTabs, this.#options.adapter().id, next);
    this.presentResults();
    this.#options.placeDisclosure();
    this.updatePathPreview();
  }

  /** Streaming results stay hidden while a supplemental operation owns the visible panel. */
  presentResults(): void {
    if (this.#mainResults !== null)
      this.#mainResults.hidden =
        !this.#options.hasResults() ||
        this.#active === "silent-payment" ||
        this.#active === "bip85";
  }

  /** Refresh the library's path preview; temporarily incomplete edits wait for normal admission. */
  updatePathPreview(): void {
    const { view } = this.#options;
    const adapter = this.#options.adapter();
    view.updatePathPreview(adapter);
    if (this.#active !== "coinjoin" || adapter.coinJoin === undefined) return;
    try {
      const paths = adapter.coinJoin.pathPreview(readControls(adapter, view.controls));
      view.controls.preview.textContent = `${paths.external}  ·  ${paths.internal}`;
    } catch {
      // Normal form submission reports the invalid partially edited input.
    }
  }

  /** Refresh adapter-dependent tabs without changing the person's checked BIP85 preference. */
  sync(): void {
    this.#sync("silent-payment", this.#silent);
    this.#sync("coinjoin", this.#coinJoin);
  }

  /** Clear optional workspace choices together with the host's Clear all action. */
  reset(): void {
    if (this.#silent.checkbox !== null) this.#silent.checkbox.checked = false;
    if (this.#bip85.checkbox !== null) this.#bip85.checkbox.checked = false;
    this.#sync("silent-payment", this.#silent);
    this.#sync("bip85", this.#bip85);
    this.select(null);
  }

  #silentPaymentOffered(): boolean {
    return silentPaymentsOffered(this.#options.adapter(), this.#options.silentPaymentAvailable);
  }

  #sync(
    feature: Exclude<DerivationFeatureTab, null>,
    controls: { checkbox: HTMLInputElement | null; tab: HTMLButtonElement | null },
  ): void {
    const { checkbox, tab } = controls;
    if (checkbox === null || tab === null) return;
    if (feature === "silent-payment") {
      // Under a coin without Silent Payments the option and its "?" are hidden, and its tick is kept
      // for Bitcoin's return, as the page keeps a coin's own options (adapter-settings.ts).
      if (!this.#options.silentPaymentAvailable) checkbox.checked = false;
      offerFeatureOption(checkbox, tab, this.#silentPaymentOffered());
    } else syncFeatureTabVisibility(checkbox, tab);
    if ((!checkbox.checked || checkbox.disabled) && this.#active === feature) {
      this.select(null);
      this.#options.schedule();
    }
  }
}
