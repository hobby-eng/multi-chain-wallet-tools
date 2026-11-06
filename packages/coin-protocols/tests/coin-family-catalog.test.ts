import { describe, expect, it } from "vitest";
import { CoinFamilyCatalog, createCoinRegistry } from "../src/coins/registry-base.js";
import { getCoinAdapter } from "../src/coins/registry.js";

describe("coin family ownership", () => {
  it("shares the same family/default choice between an embedded view and the full registry", () => {
    const legacy = getCoinAdapter("bitcoin-legacy");
    const taproot = getCoinAdapter("bitcoin-taproot");
    const registry = createCoinRegistry([legacy, taproot]);
    const catalog = new CoinFamilyCatalog(registry.COIN_FAMILIES);
    expect(catalog.get("bitcoin")).toBe(registry.getCoinFamily("bitcoin"));
    expect(catalog.defaultAdapter("bitcoin")).toBe(taproot);
    expect(registry.getDefaultCoinAdapter("bitcoin")).toBe(taproot);
  });

  it("uses the first variant when none declares itself the default", () => {
    const legacy = getCoinAdapter("bitcoin-legacy");
    const native = getCoinAdapter("bitcoin-native-segwit");
    expect(createCoinRegistry([legacy, native]).getDefaultCoinAdapter("bitcoin")).toBe(legacy);
  });

  it("refuses conflicting defaults and empty families with stable codes", () => {
    const legacy = { ...getCoinAdapter("bitcoin-legacy"), defaultVariant: true };
    const registry = createCoinRegistry([legacy, getCoinAdapter("bitcoin-taproot")]);
    expect(() => registry.getDefaultCoinAdapter("bitcoin")).toThrow(
      expect.objectContaining({ code: "coin.registry.defaults" }),
    );
    expect(() =>
      new CoinFamilyCatalog([{ id: "empty", label: "Empty", adapters: [] }]).defaultAdapter(
        "empty",
      ),
    ).toThrow(expect.objectContaining({ code: "coin.registry.empty-family" }));
  });

  it("refuses unknown selectors without converting them or echoing their contents", () => {
    const registry = createCoinRegistry([getCoinAdapter("bitcoin-legacy")]);
    const catalog = new CoinFamilyCatalog(registry.COIN_FAMILIES);
    const id = {
      toString: () => {
        throw new Error("Selector must not be converted.");
      },
    };
    expect(() => catalog.get(id)).toThrow(
      expect.objectContaining({ code: "coin.registry.family" }),
    );
    expect(() => registry.getCoinAdapter("public-unknown-marker")).toThrow(
      expect.objectContaining({ code: "coin.registry.protocol" }),
    );
  });
});
