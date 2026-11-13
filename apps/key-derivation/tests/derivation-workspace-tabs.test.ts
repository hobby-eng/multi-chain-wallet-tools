import { describe, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import { COIN_FAMILIES, getCoinAdapter } from "@ckd/coins/registry.js";
import { DerivationWorkspaceTabs } from "../src/ui/derivation-workspace-tabs.js";
import type { KeyDerivationView } from "../src/ui/view.js";

/** The original wallet's Silent Payments option, tab and panel, nested as the page's template nests them. */
function workspace(adapterId: string, silentPaymentAvailable = true) {
  const page = new CompleteIdPage();
  const option = page.add("silent-payment-option");
  option.classList.add("field-heading-row");
  const label = page.add("silent-payment-label", "label", option);
  const checkbox = page.add("include-silent-payment", "input", label);
  const tab = page.add("silent-payment-tab", "button");
  const panel = page.add("silent-payment-panel");
  tab.hidden = panel.hidden = true;
  let adapter = getCoinAdapter(adapterId);
  const schedule = vi.fn();
  const tabs: DerivationWorkspaceTabs = new DerivationWorkspaceTabs({
    view: {
      document: page.asDocument(),
      controls: {
        includeCoinJoin: page.add("include-coinjoin", "input"),
        protocolTabs: page.add("protocol-tabs"),
      },
      updatePathPreview: () => undefined,
    } as unknown as KeyDerivationView,
    adapter: () => adapter,
    hasResults: () => false,
    silentPaymentAvailable,
    activate: (feature) => tabs.select(feature),
    schedule,
    placeDisclosure: () => undefined,
  });
  tabs.sync();
  /** Another variant is chosen, as the controller then synchronizes the workspace tabs. */
  const choose = (id: string) => {
    adapter = getCoinAdapter(id);
    tabs.sync();
  };
  const state = () => [
    option.hidden,
    checkbox.disabled,
    checkbox.checked,
    tab.hidden,
    panel.hidden,
  ];
  return { tabs, checkbox, tab, schedule, choose, state };
}

describe("Silent Payments in the original wallet", () => {
  it("are offered for Bitcoin's variants and for no other coin's", () => {
    for (const family of COIN_FAMILIES)
      for (const adapter of family.adapters)
        expect(adapter.silentPayments === true, adapter.id).toBe(family.id === "bitcoin");
  });

  it("are offered while Bitcoin is chosen, and hidden with the tick kept under another coin", () => {
    const f = workspace("bitcoin-native-segwit");
    expect(f.state()).toEqual([false, false, false, true, true]);
    f.checkbox.checked = true;
    f.checkbox.dispatchEvent(new Event("change"));
    f.tab.click();
    expect(f.tabs.active).toBe("silent-payment");
    expect(f.state()).toEqual([false, false, true, false, false]);
    for (const other of ["ethereum", "solana", "cardano", "dash-core"]) {
      f.choose(other);
      expect(f.state(), other).toEqual([true, true, true, true, true]);
      expect(f.tabs.active, other).toBeNull();
      // A hidden tab cannot be chosen by a click that reaches it anyway.
      f.tab.click();
      expect(f.tabs.active, other).toBeNull();
    }
    // The open panel gave way once. The page itself closes it before a coin change (controller.ts);
    // the tabs give way on their own as well.
    expect(f.schedule).toHaveBeenCalledOnce();
    f.choose("bitcoin-taproot");
    expect(f.state()).toEqual([false, false, true, false, true]);
  });

  it("stay hidden and unticked in a build without them, even under Bitcoin", () => {
    const f = workspace("bitcoin-legacy", false);
    f.checkbox.checked = true;
    f.choose("bitcoin-legacy");
    expect(f.state()).toEqual([true, true, false, true, true]);
  });
});
