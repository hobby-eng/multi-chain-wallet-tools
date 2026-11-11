import { describe, expect, it } from "vitest";
import { COIN_WORDS } from "@ckd/recovery-backup/mnemocode-offered-coins.js";
import { inCoinMenuOrder } from "../src/ui/coin-menu-order.js";

describe("the coin lists that MHFE and MnemoCode name", () => {
  it("follow the Coin menu: Bitcoin first, then alphabetical, whatever the library's order", () => {
    // MHFE's coin list for an address check, in MHFE's own order.
    const mhfe = [
      { id: "ethereum", name: "Ethereum" },
      { id: "dash", name: "Dash" },
      { id: "litecoin", name: "Litecoin" },
      { id: "bitcoin", name: "Bitcoin" },
      { id: "bitcoin-cash", name: "Bitcoin Cash" },
    ];
    expect(inCoinMenuOrder(mhfe, ({ name }) => name).map(({ name }) => name)).toEqual([
      "Bitcoin",
      "Bitcoin Cash",
      "Dash",
      "Ethereum",
      "Litecoin",
    ]);
  });

  it("names the coins of a 0x address as MnemoCode names them, Ethereum before Ethereum Classic", () => {
    const names = ["ethereum-classic", "ethereum"].map((id) => COIN_WORDS[id]!.name);
    const shown = inCoinMenuOrder(names, (name) => name);
    expect(shown).toEqual([COIN_WORDS.ethereum!.name, COIN_WORDS["ethereum-classic"]!.name]);
    expect(shown[0]).toMatch(/^Ethereum\b(?! Classic)/u);
  });

  it("orders every coin a library offers, coins outside the build included", () => {
    expect(
      inCoinMenuOrder(["Tron", "Dash", "Cosmos", "Bitcoin", "Bitcoin Cash"], (name) => name),
    ).toEqual(["Bitcoin", "Bitcoin Cash", "Cosmos", "Dash", "Tron"]);
  });
});
