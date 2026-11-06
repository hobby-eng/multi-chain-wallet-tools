import { describe, expect, it } from "vitest";
import { getAdapterFamilyId, getCoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationControlValues } from "../src/ui/inputs.js";
import { AdapterSettingsStore } from "../src/ui/adapter-settings.js";

describe("adapter settings ownership", () => {
  it("snapshots entered settings and returns independent control values", () => {
    const owner = new AdapterSettingsStore(getAdapterFamilyId);
    const adapter = getCoinAdapter("bitcoin-taproot");
    const entered: DerivationControlValues = {
      network: "testnet",
      account: 2,
      branch: 1,
      start: 20,
      count: 25,
      includeChange: true,
      includeCoinJoin: false,
    };
    owner.remember(adapter, entered);
    entered.account = 99;
    entered.count = 1;
    const first = owner.controlsFor(adapter);
    expect(first.values.account).toBe(2);
    expect(first.values.count).toBe(25);
    first.values.count = 100;
    expect(owner.controlsFor(adapter).values.count).toBe(25);
  });

  it("forgets variant preferences on Clear", () => {
    const owner = new AdapterSettingsStore(getAdapterFamilyId);
    const adapter = getCoinAdapter("bitcoin-taproot");
    owner.selectVariant(adapter);
    expect(owner.variantForFamily(getAdapterFamilyId(adapter))).toBe(adapter.id);
    owner.clear();
    expect(owner.variantForFamily(getAdapterFamilyId(adapter))).toBeUndefined();
  });
});

it("returns an independent shared range that cannot mutate future remembered settings", () => {
  const owner = new AdapterSettingsStore(getAdapterFamilyId);
  const adapter = getCoinAdapter("bitcoin-taproot");
  owner.remember(adapter, {
    ...adapter.defaults,
    account: 7,
    start: 20,
    count: 25,
    includeChange: true,
    includeCoinJoin: false,
  });
  const first = owner.controlsFor(adapter).shared;
  expect(first).toBeDefined();
  if (first === undefined) throw new Error("A remembered range must have shared settings.");
  first.account = 99;
  first.start = 999;
  first.count = 1;
  expect(owner.controlsFor(getCoinAdapter("bitcoin-native-segwit")).shared).toEqual({
    network: "mainnet",
    account: 7,
    start: 20,
    count: 25,
  });
});
