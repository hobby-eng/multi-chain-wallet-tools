import { describe, expect, it, vi } from "vitest";
import type { AccountStatesView, RecoveryNetworkApi } from "@ckd/network-boundary/protocol.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import { ACCOUNT_COIN_RECOVERY_ADAPTERS } from "../src/coins/account-coins.js";
import { validateRecoveryNetworkRequest } from "../src/network-executor.js";
import { seedLookupsPerPhrase } from "../src/scan-estimate.js";
import type {
  RecoveryCoinAdapter,
  RecoveryScanConfig,
  RecoveryScanContext,
  RecoveryWalletResult,
} from "../src/types.js";

const MNEMONIC = `${"abandon ".repeat(11)}about`;
// Each coin's first address of the phrase above (the Deriver's startup vectors), its unit and its
// endpoint, independent of the account coin table.
const COINS = {
  solana: [
    "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
    "1 SOL",
    "https://solana-rpc.publicnode.com",
  ],
  xrp: ["rHsMGQEkVNJmpGWs8XUBoTBiAAbwxZN5v3", "1 XRP", "https://xrplcluster.com"],
  stellar: [
    "GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX",
    "1 XLM",
    "https://horizon.stellar.org",
  ],
  near: [
    "5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412",
    "1 NEAR",
    "https://free.rpc.fastnear.com",
  ],
  tron: ["TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH", "1 TRX", "https://api.trongrid.io"],
} as const;
// One unit of each coin in its atomic units.
const ONE: Readonly<Record<string, string>> = {
  solana: "1000000000",
  xrp: "1000000",
  stellar: "10000000",
  near: "1000000000000000000000000",
  tron: "1000000",
};

const adapter = (id: string): RecoveryCoinAdapter => {
  const found = ACCOUNT_COIN_RECOVERY_ADAPTERS.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No adapter ${id}.`);
  return found;
};

const config = {
  network: "mainnet",
  account: 0,
  scanCore: true,
  coreReceiveCount: 1,
  coreChangeCount: 0,
  includeUsedZeroBalance: false,
} as RecoveryScanConfig;

type AccountStates = RecoveryNetworkApi["accountStates"];

/** The provider of every account coin: `used` addresses hold one unit and exist, others nothing. */
function accountStates(used: (address: string) => boolean = () => false) {
  return vi.fn<AccountStates>(async (coin, _network, addresses): Promise<AccountStatesView> => ({
    coin,
    height: "7",
    entries: addresses.map((address) => {
      const active = used(address);
      return {
        address,
        exists: active,
        used: active,
        balance: active ? (ONE[coin] ?? "0") : "0",
        sequence: active && coin === "xrp" ? "3" : null,
      };
    }),
  }));
}

/** A scan context whose guard hands the scan's seed to `seeds`, to see it wiped afterwards. */
function context(
  states: AccountStates,
  signal = new AbortController().signal,
  seeds: Uint8Array[] = [],
): RecoveryScanContext {
  const guard = new SecretEgressGuard();
  const register = guard.registerBytes.bind(guard);
  vi.spyOn(guard, "registerBytes").mockImplementation((label, bytes) => {
    seeds.push(bytes);
    register(label, bytes);
  });
  return {
    signal,
    sessionSecretGuard: guard,
    onProgress: vi.fn(),
    onFinding: vi.fn(),
    networkApi: { accountStates: states } as unknown as RecoveryNetworkApi,
  };
}

const seed = (id: string) => ({ id, label: "Seed phrase #1", mnemonic: MNEMONIC, passphrase: "" });
const overview = (result: RecoveryWalletResult, label: string) =>
  result.overview.find((metric) => metric.label === label)?.value;

describe("account coins of the Discovery Scanner", () => {
  it("lists every account coin of the table in its group, Mainnet and seed scans only", () => {
    expect(ACCOUNT_COIN_RECOVERY_ADAPTERS.map(({ id }) => id)).toEqual(Object.keys(COINS));
    for (const coin of ACCOUNT_COIN_RECOVERY_ADAPTERS) {
      expect(coin.group).toBe("Other networks");
      expect(coin.networks).toEqual(["mainnet"]);
      expect(coin.customPath).toBeUndefined();
      expect(coin.scanWatchOnly).toBeUndefined();
    }
  });

  it.each(Object.entries(COINS))(
    "scans %s from the Deriver's addresses, in its own unit and from its own endpoint",
    async (id, [first, balanceLabel, endpoint]) => {
      const states = accountStates((address) => address === first);
      const seeds: Uint8Array[] = [];
      const result = await adapter(id).scan(
        seed("seed-1"),
        config,
        context(states, undefined, seeds),
      );
      expect(
        states.mock.calls.every(([coin, network]) => coin === id && network === "mainnet"),
      ).toBe(true);
      const [section] = result.sections;
      expect(section?.findings[0]).toMatchObject({ title: first, balanceLabel });
      expect(section?.source).toBe(endpoint);
      expect(section?.proof).toContain("at heights 7–7");
      expect(seeds.length).toBeGreaterThan(0);
      for (const bytes of seeds) expect(bytes.every((byte) => byte === 0)).toBe(true);
    },
  );

  it("shows the account sequence where the coin has one", async () => {
    const result = await adapter("xrp").scan(
      seed("seed-1"),
      config,
      context(accountStates((address) => address === COINS.xrp[0])),
    );
    expect(result.sections[0]?.findings[0]?.fields).toContainEqual({
      label: "Account sequence",
      value: "3",
    });
  });

  it("extends each layout's post-use gap and asks each address once", async () => {
    const xrpStates = accountStates((address) => address === COINS.xrp[0]);
    const xrp = await adapter("xrp").scan(seed("seed-1"), config, context(xrpStates));
    // The address index and the account index start at the same address; each runs to index 20.
    expect(overview(xrp, "Unique addresses queried")).toBe("41");
    expect(xrpStates).toHaveBeenCalledTimes(3);
    const solanaStates = accountStates((address) => address === COINS.solana[0]);
    const solana = await adapter("solana").scan(seed("seed-2"), config, context(solanaStates));
    // Phantom's layout runs to index 20 in batches of 10; Ledger's first address is unused.
    expect(overview(solana, "Unique addresses queried")).toBe("22");
    expect(solanaStates.mock.calls.map(([, , addresses]) => addresses.length)).toEqual([
      1, 10, 10, 1,
    ]);
  });

  it("refuses Testnet before the phrase is read or any address is looked up", async () => {
    const states = accountStates();
    const seeds: Uint8Array[] = [];
    await expect(
      adapter("near").scan(
        seed("seed-1"),
        { ...config, network: "testnet" },
        context(states, undefined, seeds),
      ),
    ).rejects.toMatchObject({ code: "account.network" });
    expect(states).not.toHaveBeenCalled();
    expect(seeds).toEqual([]);
  });

  it("fails a scan whose answer names another address, and wipes the seed", async () => {
    const seeds: Uint8Array[] = [];
    const wrong = vi.fn<AccountStates>(async (coin, _network, addresses) => ({
      coin,
      height: null,
      entries: addresses.map(() => ({
        address: COINS.tron[0],
        exists: false,
        used: false,
        balance: "0",
        sequence: null,
      })),
    }));
    await expect(
      adapter("tron").scan(
        seed("seed-1"),
        { ...config, account: 1 },
        context(wrong, undefined, seeds),
      ),
    ).rejects.toMatchObject({ code: "account.response" });
    for (const bytes of seeds) expect(bytes.every((byte) => byte === 0)).toBe(true);
  });

  it("stops at cancellation between batches and wipes the seed", async () => {
    const controller = new AbortController();
    const seeds: Uint8Array[] = [];
    const states = accountStates((address) => {
      controller.abort();
      return address === COINS.stellar[0];
    });
    await expect(
      adapter("stellar").scan(seed("seed-1"), config, context(states, controller.signal, seeds)),
    ).rejects.toMatchObject({ name: "AbortError", message: "Stellar scan cancelled." });
    expect(states).toHaveBeenCalledTimes(1);
    for (const bytes of seeds) expect(bytes.every((byte) => byte === 0)).toBe(true);
  });

  it("counts one lookup per provider request in the estimate", () => {
    const settings = { coreReceiveCount: "20" } as Parameters<typeof seedLookupsPerPhrase>[1];
    // XRP: two layouts, one request per address; Solana: two layouts, ten addresses per request.
    expect(seedLookupsPerPhrase([adapter("xrp")], settings)).toBe(40);
    expect(seedLookupsPerPhrase([adapter("solana")], settings)).toBe(4);
    expect(seedLookupsPerPhrase([adapter("stellar")], settings)).toBe(20);
  });
});

describe("the development network worker's account.states admission", () => {
  const request = (payload: Record<string, unknown>) => ({
    id: "account-1",
    operation: "account.states",
    payload,
  });

  it("admits an account coin of the table and a bounded batch of its addresses", () => {
    const valid = request({ network: "mainnet", coin: "tron", addresses: [COINS.tron[0]] });
    expect(validateRecoveryNetworkRequest(valid)).toEqual(valid);
  });

  it.each([
    ["an unknown coin", { network: "mainnet", coin: "ethereum", addresses: [COINS.tron[0]] }],
    ["Testnet", { network: "testnet", coin: "tron", addresses: [COINS.tron[0]] }],
    ["another coin's address", { network: "mainnet", coin: "tron", addresses: [COINS.xrp[0]] }],
    ["an extra field", { network: "mainnet", coin: "tron", addresses: [], url: "x" }],
  ])("refuses %s", (_name, payload) => {
    expect(() => validateRecoveryNetworkRequest(request(payload))).toThrow();
  });
});
