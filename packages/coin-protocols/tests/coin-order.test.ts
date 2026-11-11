import { describe, expect, it } from "vitest";
import { compareCoinNames, orderCoins } from "../src/coins/coin-order.js";
import { COIN_FAMILIES } from "../src/coins/registry.js";
import { COIN_FAMILIES as DASH_COIN_FAMILIES } from "../src/coins/dash-registry.js";

/** "Bitcoin first, then alphabetical", stated independently of the module under test. */
function listOrder(names: readonly string[]): string[] {
  const english = new Intl.Collator("en", { sensitivity: "base" });
  const rest = names.filter((name) => name !== "Bitcoin").sort(english.compare);
  return names.includes("Bitcoin") ? ["Bitcoin", ...rest] : rest;
}

describe("coin list order", () => {
  it("puts Bitcoin first and the other names in English alphabetical order, ignoring case", () => {
    const names = ["TON", "Ethereum", "Bitcoin Cash", "Dash", "tron", "Bitcoin", "NEAR", "Cosmos"];
    expect([...names].sort(compareCoinNames)).toEqual([
      "Bitcoin",
      "Bitcoin Cash",
      "Cosmos",
      "Dash",
      "Ethereum",
      "NEAR",
      "TON",
      "tron",
    ]);
    expect([...names].sort(compareCoinNames)).toEqual(listOrder(names));
  });

  it("orders a list without Bitcoin alphabetically", () => {
    expect(orderCoins(["XRP", "Dash", "Cosmos"], (name) => name)).toEqual([
      "Cosmos",
      "Dash",
      "XRP",
    ]);
  });

  it("orders groups among the coins by their names and the coins of each group together", () => {
    const coins = [
      { label: "Bitcoin" },
      { label: "Ethereum", group: "EVM networks" },
      { label: "BNB Chain", group: "EVM networks" },
      { label: "Dash" },
      { label: "XRP", group: "Other networks" },
      { label: "Cosmos", group: "Other networks" },
      { label: "Arbitrum One", group: "EVM networks" },
    ];
    expect(
      orderCoins(
        coins,
        ({ label }) => label,
        ({ group }) => group,
      ).map(({ label, group }) => (group === undefined ? label : `${group}/${label}`)),
    ).toEqual([
      "Bitcoin",
      "Dash",
      "EVM networks/Arbitrum One",
      "EVM networks/BNB Chain",
      "EVM networks/Ethereum",
      "Other networks/Cosmos",
      "Other networks/XRP",
    ]);
  });

  it("puts the group that holds Bitcoin first, with Bitcoin first inside it", () => {
    const coins = [
      { label: "Dash" },
      { label: "Litecoin", group: "UTXO coins" },
      { label: "Bitcoin", group: "UTXO coins" },
      { label: "Bitcoin Cash", group: "UTXO coins" },
    ];
    expect(
      orderCoins(
        coins,
        ({ label }) => label,
        ({ group }) => group,
      ).map(({ label }) => label),
    ).toEqual(["Bitcoin", "Bitcoin Cash", "Litecoin", "Dash"]);
  });

  it("offers the Deriver's coin families with Bitcoin first, then alphabetically", () => {
    const labels = COIN_FAMILIES.map(({ label }) => label);
    expect(labels[0]).toBe("Bitcoin");
    expect(labels).toEqual(listOrder(labels));
    expect(DASH_COIN_FAMILIES.map(({ label }) => label)).toEqual(["Dash"]);
  });
});
