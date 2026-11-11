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
const COSMOS = "cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4";
const HEDERA_KEY = "10fcec8c5db29aeab62272a08be39b1ec75eba50624351fba9948ff5d3d78ecf";
const HEDERA_ALIAS = `0.0.302a300506032b6570032100${HEDERA_KEY}`;
const HEDERA_EVM = "0xC283f34aDafdB758a557304C5F5e4c1E0A554713";
const HEDERA_ECDSA_KEY = "021de0d6f31872bbda0cfd1680e41a5a88af2646b8d1d015c5e1541ab21a0f4499";
const HEDERA_ECDSA_ALIAS = `0.0.302d300706052b8104000a032200${HEDERA_ECDSA_KEY}`;
const TON = "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY";
const TON_BOUNCEABLE = "EQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-U9d";
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

  it("paces TON alone, at TON Center's unkeyed limit, and numbers Hedera's accounts alone", () => {
    // TON Center answered 429 to two requests within a second without a key (2026-11-10).
    expect(ACCOUNT_COINS.filter((row) => row.pace !== undefined).map(({ id }) => id)).toEqual([
      "ton",
    ]);
    const ton = accountCoin("ton");
    expect(ton.pace).toBeGreaterThanOrEqual(1000);
    expect(ton.addressesPerRequest).toBe(1);
    // One lookup at that pace stays well within a provider request's 30-second deadline.
    expect(ton.batch * (ton.pace ?? 0)).toBeLessThanOrEqual(15_000);
    expect(
      ACCOUNT_COINS.filter((row) => row.numberedAccounts === true).map(({ id }) => id),
    ).toEqual(["hedera"]);
  });
});

describe("the account.states payload", () => {
  it("admits a bounded batch of canonical addresses of a coin of the build", () => {
    expect(() => service.validatePayload(payload("xrp", [XRP]))).not.toThrow();
    expect(() => service.validatePayload(payload("near", [NEAR]))).not.toThrow();
    expect(() => service.validatePayload(payload("cosmos", [COSMOS]))).not.toThrow();
    expect(() =>
      service.validatePayload(
        payload("hedera", [HEDERA_ALIAS, HEDERA_ECDSA_ALIAS, HEDERA_EVM, "0.0.163372"]),
      ),
    ).not.toThrow();
    expect(() => service.validatePayload(payload("ton", Array(10).fill(TON)))).not.toThrow();
  });

  it.each([
    ["Cosmos in upper case", payload("cosmos", [COSMOS.toUpperCase()])],
    ["an EVM address in lower case", payload("hedera", [HEDERA_EVM.toLowerCase()])],
    ["an account ID with its checksum", payload("hedera", ["0.0.163372-giukq"])],
    ["a raw Ed25519 key", payload("hedera", [HEDERA_KEY])],
    ["a bare DER public key", payload("hedera", [HEDERA_ALIAS.slice(4)])],
    ["a bare compressed ECDSA key", payload("hedera", [HEDERA_ECDSA_KEY])],
    [
      "an ECDSA alias whose key is off the curve",
      payload("hedera", [`0.0.302d300706052b8104000a03220002${"f".repeat(64)}`]),
    ],
    ["a bounceable TON address", payload("ton", [TON_BOUNCEABLE])],
    [
      "TON's raw form",
      payload("ton", ["0:335996ba9cce6625ebfdd7019ced50927c1a08b1846a289a55efc37c01d77df9"]),
    ],
  ])("refuses %s, which the Viewer turns into the canonical form first", (_name, value) => {
    expect(() => service.validatePayload(value)).toThrow(
      expect.objectContaining({ code: "account.address" }),
    );
  });

  it("refuses a TON batch above the 10 addresses one paced lookup reads", () => {
    expect(() => service.validatePayload(payload("ton", Array(11).fill(TON)))).toThrow(
      expect.objectContaining({ code: "account.batch" }),
    );
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

describe("the account states check of a coin that numbers its accounts", () => {
  const facts = accountCoin("hedera");
  const account = (id: string, balance = "1") => ({ id, balance });
  const state = {
    address: HEDERA_ALIAS,
    exists: true,
    used: true,
    balance: "14290",
    sequence: null,
    accounts: [account("0.0.200", "6"), account("0.0.163372", "14284")],
  };
  const view = { coin: "hedera", height: null, entries: [state] };
  const none = { ...state, exists: false, used: false, balance: "0", accounts: [] };

  it("admits the accounts an address found with their balances, and an address that found none", () => {
    expect(assertAccountStatesView(facts, [HEDERA_ALIAS], view)).toBe(view);
    const empty = { ...view, entries: [none] };
    expect(assertAccountStatesView(facts, [HEDERA_ALIAS], empty)).toBe(empty);
  });

  it.each([
    ["no account list", { ...state, accounts: undefined }],
    ["an account list without its key", (({ accounts: _, ...rest }) => rest)(state)],
    ["an existing address without accounts", { ...state, accounts: [] }],
    [
      "accounts of an address that does not exist",
      { ...none, used: true, accounts: [account("0.0.1", "0")] },
    ],
    ["accounts out of order", { ...state, accounts: [...state.accounts].reverse() }],
    [
      "a repeated account",
      { ...state, balance: "12", accounts: [account("0.0.200", "6"), account("0.0.200", "6")] },
    ],
    ["a non-canonical account", { ...state, balance: "1", accounts: [account("0.0.0200")] }],
    ["an account of another shard", { ...state, balance: "1", accounts: [account("1.0.200")] }],
    ["a bare account number", { ...state, balance: "1", accounts: ["0.0.200"] }],
    [
      "an account with another field",
      { ...state, balance: "1", accounts: [{ ...account("0.0.200"), deleted: false }] },
    ],
    [
      "a negative account balance",
      { ...state, balance: "1", accounts: [account("0.0.200", "-1")] },
    ],
    // The address's balance must be the sum of its accounts' balances.
    ["balances that do not sum to the address's", { ...state, balance: "14291" }],
    [
      "more accounts than one page",
      {
        ...state,
        balance: "101",
        accounts: Array.from({ length: 101 }, (_, at) => account(`0.0.${at + 1}`)),
      },
    ],
  ])("refuses %s", (_name, changed) => {
    expect(() =>
      assertAccountStatesView(facts, [HEDERA_ALIAS], { ...view, entries: [changed] }),
    ).toThrow(expect.objectContaining({ code: "account.response" }));
  });

  it("refuses an account list on a coin that does not number its accounts", () => {
    const xrp = {
      coin: "xrp",
      height: null,
      entries: [
        { address: XRP, exists: true, used: true, balance: "1", sequence: "2", accounts: [] },
      ],
    };
    expect(() => assertAccountStatesView(accountCoin("xrp"), [XRP], xrp)).toThrow(
      expect.objectContaining({ code: "account.response" }),
    );
  });
});
