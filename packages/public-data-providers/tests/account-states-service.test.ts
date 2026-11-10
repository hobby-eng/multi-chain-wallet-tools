import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAccountStatesView } from "../src/account-coin-facts.js";
import { ACCOUNT_COIN_READERS, ACCOUNT_COINS, accountCoin } from "../src/account-coins.js";
import { AccountStatesService } from "../src/account-states-service.js";
import { PublicMultiChainDataService } from "../src/multi-chain-service.js";

afterEach(() => vi.unstubAllGlobals());

// The first addresses of the public "abandon … about" phrase (the Deriver's startup vectors).
const XRP = "rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3";
const NEAR = "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412";
const service = new AccountStatesService(ACCOUNT_COIN_READERS);
const payload = (coin: unknown, addresses: unknown, network: unknown = "mainnet") => ({
  network,
  coin,
  addresses,
});

describe("the account coin table", () => {
  it("keeps every row within its provider's request limits and the tools' units", () => {
    for (const row of ACCOUNT_COINS) {
      expect(row.endpoint).toMatch(/^https:\/\/[a-z0-9.-]+$/u);
      expect(row.addressesPerRequest).toBeGreaterThanOrEqual(1);
      expect(row.batch % row.addressesPerRequest).toBe(0);
      expect(row.decimals).toBeLessThanOrEqual(30);
    }
    // PublicNode's Solana endpoint admits at most 10 accounts per getMultipleAccounts (2026-11-10).
    expect(accountCoin("solana").batch).toBeLessThanOrEqual(10);
    expect(() => accountCoin("ethereum")).toThrow(/No account coin ethereum/u);
  });
});

describe("the account.states payload", () => {
  it("admits a bounded batch of canonical addresses of a coin of the build", () => {
    expect(() => service.validatePayload(payload("xrp", [XRP]))).not.toThrow();
    expect(() => service.validatePayload(payload("near", [NEAR]))).not.toThrow();
  });

  it.each([
    ["a coin outside the build", payload("ethereum", [XRP]), "account.coin"],
    ["Testnet", payload("xrp", [XRP], "testnet"), "account.network"],
    ["an empty batch", payload("xrp", []), "account.batch"],
    ["a batch above the row's", payload("xrp", Array(21).fill(XRP)), "account.batch"],
    ["another coin's address", payload("xrp", [NEAR]), "account.address"],
    ["a broken checksum", payload("xrp", [`${XRP.slice(0, -1)}4`]), "account.address"],
    ["a non-canonical spelling", payload("near", [NEAR.toUpperCase()]), "account.address"],
    ["an overlong value", payload("near", [`${NEAR}${"0".repeat(200)}`]), "account.address"],
  ])("refuses %s with its code", (_name, value, code) => {
    expect(() => service.validatePayload(value)).toThrow(expect.objectContaining({ code }));
  });

  it("refuses a payload with another field and sends nothing for a refused request", async () => {
    expect(() => service.validatePayload({ ...payload("xrp", [XRP]), extra: 1 })).toThrow(
      /unsupported fields/u,
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      new PublicMultiChainDataService().accountStates("xrp", "testnet", [XRP]),
    ).rejects.toMatchObject({ code: "account.network" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads through the development facade from the coin's own endpoint", async () => {
    const body = readFileSync(
      new URL("../../../test/fixtures/account-coins/xrp-found.json", import.meta.url),
      "utf8",
    );
    const fetcher = vi.fn(async () => new Response(body));
    vi.stubGlobal("fetch", fetcher);
    const view = await new PublicMultiChainDataService().accountStates("xrp", "mainnet", [XRP]);
    expect(view.entries[0]?.balance).toBe("2275160859");
    expect(fetcher).toHaveBeenCalledWith("https://xrplcluster.com", expect.anything());
  });
});

describe("the account states check", () => {
  const facts = accountCoin("xrp");
  const view = {
    coin: "xrp",
    height: "108238352",
    entries: [{ address: XRP, exists: true, used: true, balance: "2275160859", sequence: "210" }],
  };

  it("admits the states of exactly the requested addresses", () => {
    expect(assertAccountStatesView(facts, [XRP], view)).toBe(view);
  });

  it.each([
    ["another coin's view", { ...view, coin: "tron" }],
    ["a missing entry", { ...view, entries: [] }],
    ["a height that is no integer", { ...view, height: "-1" }],
    ["an extra field", { ...view, chainId: "0" }],
    ["another address", { ...view, entries: [{ ...view.entries[0], address: NEAR }] }],
    ["an account that exists unused", { ...view, entries: [{ ...view.entries[0], used: false }] }],
    [
      "a balance of an account that does not exist",
      { ...view, entries: [{ ...view.entries[0], exists: false, sequence: null }] },
    ],
    ["a negative balance", { ...view, entries: [{ ...view.entries[0], balance: "-1" }] }],
    ["a balance as a number", { ...view, entries: [{ ...view.entries[0], balance: 1 }] }],
  ])("refuses %s as a provider error", (_name, changed) => {
    expect(() => assertAccountStatesView(facts, [XRP], changed)).toThrow(
      expect.objectContaining({ code: "account.response" }),
    );
  });
});
