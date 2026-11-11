// Every coin list that the build composes shows Bitcoin first, then the other coins alphabetically
// (owner, 2026-11-11): the Viewer's coin menu, the Inspector's chain menu, the Deriver's
// derivation-type help and the protocol lines of the footers.
import { describe, expect, it } from "vitest";
import { BUILD_PROFILES, applyProfileTemplate, getToolBuild } from "./build-profiles.mjs";
import { createDiscoveryCompositionPlugin } from "./discovery-composition.mjs";
import { createKeyDerivationCompositionPlugin } from "./key-derivation-composition.mjs";
import { ToolProtocolFooter } from "./tool-protocol-footer.mjs";

const MULTI_CHAIN = BUILD_PROFILES["multi-chain"];

/** "Bitcoin first, then alphabetical", stated independently of tooling/coin-order. */
function listOrder(names) {
  const english = new Intl.Collator("en", { sensitivity: "base" });
  const rest = names.filter((name) => name !== "Bitcoin").sort(english.compare);
  return names.includes("Bitcoin") ? ["Bitcoin", ...rest] : rest;
}

const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

/** The source that a composition plugin (`plugin`) loads for the virtual module `path`. */
function composedSource(plugin, path) {
  let load;
  plugin.setup({
    onResolve() {},
    onLoad(_filter, callback) {
      load = callback;
    },
  });
  return load({ path }).contents;
}

const render = (template, tool, profile = MULTI_CHAIN) =>
  applyProfileTemplate(template, profile, getToolBuild(profile, tool));

/** The menu's top level (coins and group names) and each group's coins, as the page shows them. */
function menu(html) {
  const top = [];
  const groups = new Map();
  for (const [, label, inside, option] of html.matchAll(
    /<optgroup label="([^"]+)">(.*?)<\/optgroup>|<option[^>]*>([^<]+)<\/option>/gu,
  )) {
    if (label === undefined) top.push(option);
    else {
      top.push(label);
      groups.set(
        label,
        [...inside.matchAll(/<option[^>]*>([^<]+)<\/option>/gu)].map(([, name]) => name),
      );
    }
  }
  return { top, groups };
}

describe("coin lists", () => {
  it("orders the Viewer's coin menu: Bitcoin first, then coins and groups alphabetically, Bitcoin selected", () => {
    const html = render("__ACTIVITY_COIN_CONTROL__", "activity-viewer");
    const { top, groups } = menu(html);
    expect(top).toEqual(["Bitcoin", "Dash", "EVM networks", "Other networks"]);
    expect(top).toEqual(listOrder(top));
    for (const coins of groups.values()) {
      expect(coins.length).toBeGreaterThan(1);
      expect(coins).toEqual(listOrder(coins));
    }
    expect(html).toContain('<option value="bitcoin" selected>Bitcoin</option>');
  });

  it("orders the Inspector's chain menu with Bitcoin first", () => {
    const names = [
      ...render("__PSBT_CHAIN_OPTIONS__", "psbt-inspector").matchAll(/<option[^>]*>([^<]+)</gu),
    ].map(([, name]) => name);
    expect(names).toEqual(["Bitcoin", "Dash Core"]);
    expect(names).toEqual(listOrder(names));
  });

  it("names the coins of the derivation-type help in the Coin menu's order", () => {
    const help = render("__DERIVATION_TYPE_HELP__", "key-derivation");
    const names = [...help.matchAll(/<strong>([^<:]+):<\/strong>/gu)].map(([, name]) => name);
    expect(names.length).toBeGreaterThan(10);
    expect(names).toEqual(listOrder(names));
  });

  it("orders the coins of every composed Multi-Chain build and leaves the Dash Community build without the rule", () => {
    const deriver = (selection) =>
      composedSource(
        createKeyDerivationCompositionPlugin("/workspace", selection),
        "ckd:selected-coin-registry",
      );
    for (const coins of [["dash", "bitcoin"], ["ethereum"]]) {
      const source = deriver(options(coins));
      expect(source).toMatch(/createCoinRegistry\(\[[^\]]+\], \(labels\) => orderCoins\(labels/u);
      expect(source).toContain("export { compareCoinNames } from");
      expect(source).toContain("coin-order.ts");
    }
    // The Dash Community Edition's one coin: its build names no other coin, Bitcoin included.
    const dash = deriver({ ...options(["dash"]), dashCommunity: true });
    expect(dash).not.toContain("coin-order");
    expect(dash).toContain("export function compareCoinNames() { return 0; }");
    const scanner = (coins) =>
      composedSource(
        createDiscoveryCompositionPlugin("/workspace", options(coins, ["seed-discovery"])),
        "ckd:selected-discovery-registry",
      );
    expect(scanner(["dash", "solana", "bitcoin"])).toMatch(
      /createRecoveryCoinRegistry\(orderCoins\(\[/u,
    );
    expect(scanner(["dash"])).not.toContain("coin-order");
  });

  it("orders the Viewer's footer and capability card as its coin menu: Bitcoin, Dash, EVM networks, Other networks", () => {
    const footer = render("__ACTIVITY_FOOTER_PROTOCOLS__", "activity-viewer");
    const at = (text) => footer.indexOf(text);
    expect(at("Bitcoin public history")).toBe(0);
    expect(at("Dash Evo SDK")).toBeLessThan(at("Ethereum and EVM network"));
    expect(at("Ethereum and EVM network")).toBeLessThan(at("account balances of other networks"));
    const card = [
      ...render("__ACTIVITY_CAPABILITY_CARD__", "activity-viewer").matchAll(
        /<span class="capability-check">✓<\/span><span>([^<]+)<\/span>/gu,
      ),
    ].map(([, text]) => text);
    expect(card).toEqual([
      "Bitcoin address history",
      "Dash Core, Platform, Identity and Orchard",
      "Ethereum and EVM network accounts",
      "Account balances on other networks",
    ]);
  });

  it("orders the coins of every protocol footer, with fewer coins too", () => {
    const parts = (text) => text.split(" · ");
    const deriver = parts(new ToolProtocolFooter(MULTI_CHAIN).render("key-derivation"));
    // Each part of the Deriver's line begins with its coin's name.
    const coinParts = deriver.filter(
      (part) => !["BIP39", "BIP32", "Platform", "Identity", "Orchard"].includes(part),
    );
    expect(coinParts).toEqual(listOrder(coinParts));
    const scanner = new ToolProtocolFooter(MULTI_CHAIN).render("discovery-scanner");
    expect(scanner.indexOf("Bitcoin BIP44")).toBe(0);
    expect(scanner.indexOf("Dash Core")).toBeLessThan(scanner.indexOf("EVM EOA"));
    expect(scanner.indexOf("EVM EOA")).toBeLessThan(scanner.indexOf("Account balance"));
    for (const [, list] of scanner.matchAll(/discovery: ([^·]+)/gu)) {
      const names = list.trim().split(", ");
      expect(names).toEqual(listOrder(names));
    }
    expect(
      new ToolProtocolFooter(MULTI_CHAIN, { coins: ["ton", "cosmos", "dash"] }).render(
        "key-derivation",
      ),
    ).toBe("BIP39 · BIP32 · Cosmos · Dash Core · Platform · Identity · Orchard · TON");
    const inspector = new ToolProtocolFooter(MULTI_CHAIN).render("psbt-inspector");
    expect(inspector.indexOf("BIP-174")).toBeLessThan(inspector.indexOf("Dash Core PSBT"));
  });
});
