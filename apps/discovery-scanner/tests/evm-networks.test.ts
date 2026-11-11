import { describe, expect, it, vi } from "vitest";
import { HDKey } from "@scure/bip32";
import {
  ETHEREUM_CLASSIC_ADDRESSES,
  ethereumClassicDerivation,
} from "@ckd/coins/ethereum-classic/index.js";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { EVM_NETWORKS } from "@ckd/public-data-providers/evm-networks.js";
import type { RecoveryNetworkApi } from "@ckd/network-boundary/protocol.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import { resolveWatchOnlyTargets } from "@ckd/recovery/watch-only.js";
import { ETHEREUM_RECOVERY_ADAPTER } from "../src/coins/ethereum/index.js";
import { developmentEvmOptions, EVM_NETWORK_RECOVERY_ADAPTERS } from "../src/coins/evm-networks.js";
import { evmNetworkPrivacy } from "../src/coins/evm/coin.js";
import { evmLayouts } from "../src/coins/evm/layouts.js";
import { candidateSummary, scanCandidates } from "../src/candidate-scan.js";
import { enrichRecoveryHistory } from "../src/history.js";
import { MULTI_CHAIN_WATCH_ONLY_PROFILE } from "../src/multi-chain-watch-only.js";
import { validateRecoveryNetworkRequest } from "../src/network-executor.js";
import type {
  RecoveryCoinAdapter,
  RecoveryScanConfig,
  RecoveryScanContext,
  RecoveryWalletResult,
} from "../src/types.js";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// MetaMask's first account of the phrase above (m/44'/60'/0'/0/0), on every EVM network.
const FIRST_ACCOUNT = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
// Ethereum Classic's first BIP44 account of the phrase above at its coin type 61 (m/44'/61'/0'/0/0):
// the Deriver's startup vector, which MnemoCode's own Rust derivation finds at the same path.
const ETC_FIRST_ACCOUNT = "0xFA22515E43658ce56A7682B801e9B5456f511420";
// Ledger's legacy Ethereum Classic account m/44'/60'/160720'/0'/0 of the phrase above, as
// test/oracles/bip32_oracle.py's BIP32 with a separate Keccak-256 derives it (2026-11-11).
const ETC_LEDGER_LEGACY_FIRST = "0x4C067164DFD49d0b8B63A466296667683202e43B";
// EIP-155 chain ids (chainlist.org, 2026-11-10), independent of the EVM network table.
const CHAIN_IDS: Readonly<Record<string, string>> = {
  ethereum: "1",
  "bnb-chain": "56",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
  base: "8453",
  avalanche: "43114",
  gnosis: "100",
  "ethereum-classic": "61",
};
const ASSETS: Readonly<Record<string, string>> = {
  "bnb-chain": "BNB",
  polygon: "POL",
  arbitrum: "ETH",
  optimism: "ETH",
  base: "ETH",
  avalanche: "AVAX",
  gnosis: "xDAI",
  "ethereum-classic": "ETC",
};

const adapter = (id: string): RecoveryCoinAdapter => {
  const found = [ETHEREUM_RECOVERY_ADAPTER, ...EVM_NETWORK_RECOVERY_ADAPTERS].find(
    (candidate) => candidate.id === id,
  );
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

type EvmAccounts = RecoveryNetworkApi["evmAccounts"];

/** Each chain's own answers: `used` accounts hold 1 unit (10^18 wei) and nonce 1, others nothing. */
function evmAccounts(
  used: (coin: string, address: string) => boolean = () => false,
  chainId: (coin: string) => string | undefined = (coin) => CHAIN_IDS[coin],
) {
  return vi.fn<EvmAccounts>(async (coin, _network, addresses) => ({
    chainId: chainId(coin) ?? "0",
    blockNumber: "5",
    entries: addresses.map((address) => {
      const active = used(coin, address);
      return { address, balance: active ? "1000000000000000000" : "0", nonce: active ? "1" : "0" };
    }),
  }));
}

function context(accounts: EvmAccounts): RecoveryScanContext {
  const unavailable = async (): Promise<never> => {
    throw new Error("Unexpected network operation.");
  };
  return {
    signal: new AbortController().signal,
    sessionSecretGuard: new SecretEgressGuard(),
    onProgress: vi.fn(),
    onFinding: vi.fn(),
    networkApi: {
      addressHistory: unavailable,
      evmAccounts: accounts,
    } as unknown as RecoveryNetworkApi,
  };
}

const seed = (id: string) => ({ id, label: "Seed phrase #1", mnemonic: MNEMONIC, passphrase: "" });
const overview = (result: RecoveryWalletResult, label: string) =>
  result.overview.find((metric) => metric.label === label)?.value;

describe("EVM networks of the Discovery Scanner", () => {
  it.each(Object.entries(ASSETS))(
    "scans %s on its own chain, in its own asset, on Mainnet only",
    async (id, asset) => {
      const coin = adapter(id);
      expect(coin.networks).toEqual(["mainnet"]);
      expect(coin.group).toBe("EVM networks");
      expect(coin.amountUnit?.("core")).toEqual({ asset, atomicUnit: "wei", decimals: 18 });
      const accounts = evmAccounts((_coin, address) => address === FIRST_ACCOUNT);
      const result = await coin.scan(seed("seed-1"), config, context(accounts));
      expect(accounts.mock.calls.every(([coin]) => coin === id)).toBe(true);
      expect(result.coinId).toBe(id);
      const [finding] = result.sections[0]!.findings;
      expect(finding).toMatchObject({ title: FIRST_ACCOUNT, balanceLabel: `1 ${asset}` });
      expect(result.sections[0]!.proof).toContain(`chain id ${CHAIN_IDS[id]}`);
    },
  );

  it("reads no history for a network without a history provider: unsupported, never zero", async () => {
    const coin = adapter("base");
    expect(coin.getHistory).toBeUndefined();
    const ctx = context(evmAccounts((_coin, address) => address === FIRST_ACCOUNT));
    const result = await coin.scan(seed("seed-1"), config, ctx);
    await enrichRecoveryHistory(coin, result, ctx);
    expect(result.sections[0]!.findings[0]!.history).toMatchObject({
      status: "unsupported",
      asset: "ETH",
      atomicUnit: "wei",
      decimals: 18,
      totalReceivedAtomic: null,
    });
  });

  it("refuses Testnet for a network without one before any lookup", async () => {
    const accounts = evmAccounts();
    await expect(
      adapter("bnb-chain").scan(
        seed("seed-1"),
        { ...config, network: "testnet" },
        context(accounts),
      ),
    ).rejects.toThrow(/BNB Chain has no testnet/u);
    expect(accounts).not.toHaveBeenCalled();
  });

  it("fails a scan whose answers name another chain instead of reporting its accounts", async () => {
    await expect(
      adapter("polygon").scan(seed("seed-1"), config, context(evmAccounts(undefined, () => "1"))),
    ).rejects.toMatchObject({
      code: "evm.chain-id",
      message: expect.stringMatching(/Polygon RPC reported chain 1, not chain 137/u),
    });
  });

  it("extends the post-use gap on the network where the account is used, and only there", async () => {
    const accounts = evmAccounts(
      (coin, address) => coin === "bnb-chain" && address === FIRST_ACCOUNT,
    );
    const bnb = await adapter("bnb-chain").scan(seed("seed-1"), config, context(accounts));
    const base = await adapter("base").scan(seed("seed-2"), config, context(accounts));
    // BNB: the standard and Ledger Live profiles each run to index 20 after the used index 0 (their
    // first address is the same account), and the legacy profile asks one address.
    expect(overview(bnb, "Unique addresses queried")).toBe("42");
    expect(overview(base, "Unique addresses queried")).toBe("2");
  });

  it("reports a candidate scan on Testnet as unsupported for a network without one", async () => {
    const results: RecoveryWalletResult[] = [];
    await scanCandidates(
      [seed("candidate-1")],
      [ETHEREUM_RECOVERY_ADAPTER, adapter("bnb-chain")],
      { ...config, network: "testnet" },
      context(evmAccounts(undefined, (coin) => (coin === "ethereum" ? "11155111" : undefined))),
      (phrase) => phrase,
      (result) => results.push(result),
    );
    const bnb = results.find(({ coinId }) => coinId === "bnb-chain");
    expect(bnb?.warnings).toEqual(["Selected network is not supported by this coin adapter."]);
    expect(candidateSummary(bnb!)).toMatch(/incomplete check/u);
    expect(results.find(({ coinId }) => coinId === "ethereum")?.sections[0]?.state).toBe(
      "complete",
    );
  });
});

/** The Deriver's Ethereum Classic row: the address and path of `account`'s receive key `index`. */
function deriverEtcAccount(account: number, index: number): { address: string; path: string } {
  const derive = ethereumClassicDerivation("ethereum-classic");
  if (derive === undefined) throw new Error("No Ethereum Classic derivation.");
  const result = derive({
    seed: mnemonicToSeed(MNEMONIC),
    network: "mainnet",
    account,
    branch: 0,
    start: index,
    count: 1,
  });
  try {
    const row = result.rows[0]!;
    return { address: row.basic.find(({ key }) => key === "address")!.value, path: row.path };
  } finally {
    clearDerivationResult(result);
  }
}

describe("Ethereum Classic's layouts", () => {
  const etc = () => adapter("ethereum-classic");
  const queried = (accounts: ReturnType<typeof evmAccounts>) =>
    accounts.mock.calls.flatMap(([, , addresses]) => addresses);

  it("checks its own wallets' layouts first, from its Deriver coin, then Ethereum's three at 60", () => {
    const layouts = evmLayouts(ETHEREUM_CLASSIC_ADDRESSES);
    expect(layouts.map(({ id, label }) => [id, label])).toEqual([
      ["ethereum-classic", "BIP44 · coin type 61 · m/44'/61'/a'/0/i"],
      ["ethereum-classic-accounts", "Ledger Live accounts · m/44'/61'/i'/0/0"],
      [
        "ethereum-classic-ledger-legacy",
        "Ledger legacy Ethereum Classic / MEW · m/44'/60'/160720'/0'/i",
      ],
      ["ethereum-standard", "Ethereum's BIP44 · MetaMask · m/44'/60'/a'/0/i"],
      ["ethereum-ledger-live", "Ethereum's Ledger Live accounts · m/44'/60'/i'/0/0"],
      ["ethereum-ledger-legacy", "Ethereum's legacy Ledger / MEW · m/44'/60'/0'/i"],
    ]);
    // Ledger's legacy Ethereum Classic path ignores the Account setting, as legacy Ledger / MEW does.
    expect(layouts.map((layout) => layout.path(2, 3))).toEqual([
      "m/44'/61'/2'/0/3",
      "m/44'/61'/5'/0/0",
      "m/44'/60'/160720'/0'/3",
      "m/44'/60'/2'/0/3",
      "m/44'/60'/5'/0/0",
      "m/44'/60'/0'/3",
    ]);
    expect(etc().customPath?.defaultTemplate?.("mainnet")).toBe("m/44'/61'/0'/0/{index}");
    expect(etc().standardScan?.note).toContain(
      "Ethereum Classic's own wallets' layouts come first",
    );
    expect(etc().minimumSeedLookups?.({ coreReceiveCount: 1 } as never)).toBe(6);
    expect(etc().getHistory).toBeDefined();
  });

  it("keeps every other network's three layouts and their paths", () => {
    for (const row of EVM_NETWORKS.filter(({ id }) => id !== "ethereum-classic")) {
      const layouts = evmLayouts();
      expect(layouts.map(({ id, label }) => [id, label])).toEqual([
        ["standard", "Standard BIP44 · MetaMask / Trezor"],
        ["ledger-live", "Ledger Live accounts"],
        ["ledger-legacy", "Legacy Ledger / MEW"],
      ]);
      expect(layouts.map((layout) => layout.path(2, 3))).toEqual([
        "m/44'/60'/2'/0/3",
        "m/44'/60'/5'/0/0",
        "m/44'/60'/0'/3",
      ]);
      expect(adapter(row.id).customPath?.defaultTemplate?.("mainnet")).toBe(
        "m/44'/60'/0'/0/{index}",
      );
      expect(adapter(row.id).minimumSeedLookups?.({ coreReceiveCount: 1 } as never)).toBe(3);
    }
  });

  it("says in the coin picker which operator can link the networks' addresses", () => {
    expect(adapter("base").groupNote).toBe(
      "Each selected network's provider receives the same derived addresses with your IP address; PublicNode runs the endpoints of 8 of these 9 networks and can link them. Choose only the networks the wallet used.",
    );
    expect(evmNetworkPrivacy([{ rpcOperator: "HebeBlock" }])).toBe(
      "Each selected network's provider receives the same derived addresses with your IP address. Choose only the networks the wallet used.",
    );
    expect(
      evmNetworkPrivacy([{ rpcOperator: "PublicNode" }, { rpcOperator: "PublicNode" }]),
    ).toContain("PublicNode runs the endpoints of both networks and can link them");
    expect(
      evmNetworkPrivacy([{ rpcOperator: "A" }, { rpcOperator: "A" }, { rpcOperator: "A" }]),
    ).toContain("A runs the endpoints of all 3 networks and can link them");
  });

  it("takes its own wallets' layouts from the Deriver coin its row names, and no other row any", () => {
    for (const row of EVM_NETWORKS)
      expect(developmentEvmOptions(row).addresses).toBe(
        row.walletCoin === "ethereum-classic" ? ETHEREUM_CLASSIC_ADDRESSES : undefined,
      );
    expect(EVM_NETWORKS.filter((row) => row.walletCoin !== undefined).map(({ id }) => id)).toEqual([
      "ethereum-classic",
    ]);
    expect(() => developmentEvmOptions({ ...EVM_NETWORKS[0]!, walletCoin: "tron" })).toThrow(
      /No public addresses of the Deriver coin tron/u,
    );
  });

  it("says where a finding the Deriver cannot open is recovered", () => {
    for (const id of ["ethereum", "ethereum-classic"])
      expect(adapter(id).standardScan?.note).toContain(
        "A finding at a legacy Ledger path or at a custom path cannot be opened in the Deriver, which takes no custom paths; recover it with Ledger Live, MEW or another wallet that takes the path.",
      );
  });

  it("finds the Deriver's BIP44 account at 61, Ledger's legacy account and MetaMask's account at 60", async () => {
    expect(deriverEtcAccount(0, 0)).toEqual({
      address: ETC_FIRST_ACCOUNT,
      path: "m/44'/61'/0'/0/0",
    });
    const accounts = evmAccounts(
      (coin, address) =>
        coin === "ethereum-classic" &&
        [ETC_FIRST_ACCOUNT, ETC_LEDGER_LEGACY_FIRST, FIRST_ACCOUNT].includes(address),
    );
    const result = await etc().scan(seed("seed-1"), config, context(accounts));
    expect(accounts.mock.calls.every(([coin]) => coin === "ethereum-classic")).toBe(true);
    const [section] = result.sections;
    expect(section!.source).toBe("https://etc.etcdesktop.com");
    expect(section!.proof).toContain("chain id 61");
    const found = section!.findings.map((finding) => [
      finding.title,
      finding.fields.find(({ label }) => label === "Derivation path")?.value,
      finding.balanceLabel,
    ]);
    expect(found).toEqual([
      [ETC_FIRST_ACCOUNT, "m/44'/61'/0'/0/0", "1 ETC"],
      [ETC_LEDGER_LEGACY_FIRST, "m/44'/60'/160720'/0'/0", "1 ETC"],
      [FIRST_ACCOUNT, "m/44'/60'/0'/0/0", "1 ETC"],
    ]);
  });

  it("derives its own layouts at the oracle's addresses and as the Deriver's row does", async () => {
    const accounts = evmAccounts();
    await etc().scan(
      seed("seed-1"),
      { ...config, account: 1, coreReceiveCount: 2 },
      context(accounts),
    );
    const addresses = queried(accounts);
    // BIP44's address index under account 1, and Ledger Live's accounts 1 and 2: the Deriver's rows.
    for (const [account, index] of [
      [1, 0],
      [1, 1],
      [2, 0],
    ] as const)
      expect(addresses).toContain(deriverEtcAccount(account, index).address);
    // Independent values (test/oracles/bip32_oracle.py's BIP32 with a separate Keccak-256,
    // 2026-11-11): Ledger Live's accounts 1 and 2 at 61, and Ledger's legacy path, whose indexes do
    // not move with the Account setting.
    expect(addresses).toEqual(
      expect.arrayContaining([
        "0x30d8947b9c14DEB3d9a792FC110c2F818A91397D",
        "0xC8dB6723A71d95650b5b87A6Dee6501Fdc8c1db2",
        ETC_LEDGER_LEGACY_FIRST,
        "0x5384FeaCa8F17e6Ef553cdF90c29Cb7e74F9D020",
      ]),
    );
  });

  it("scans a custom path beside its six layouts", async () => {
    const ctx = context(evmAccounts());
    const result = await etc().scan(
      seed("seed-1"),
      {
        ...config,
        scanCustomPath: true,
        customPathTemplate: "m/44'/61'/7'/0/{index}",
        customPathFormat: "eoa",
        customPathCount: 1,
      },
      ctx,
    );
    expect(result.sections[0]!.description).toMatch(
      /^Scans 6 standard EOA profiles and the selected custom paths/u,
    );
    expect(vi.mocked(ctx.onProgress).mock.calls.map(([event]) => event.message)).toContain(
      "Custom path · EVM: checked 1 of 1 derivation candidates",
    );
  });
});

describe("EVM network watch-only keys", () => {
  const account = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC)).derive("m/44'/60'/0'");
  const resolve = (raw: string, adapters: readonly RecoveryCoinAdapter[]) =>
    resolveWatchOnlyTargets(
      raw,
      adapters,
      MULTI_CHAIN_WATCH_ONLY_PROFILE.prefixCoins,
      MULTI_CHAIN_WATCH_ONLY_PROFILE.multiChain,
      MULTI_CHAIN_WATCH_ONLY_PROFILE.networklessAdapterIds,
      MULTI_CHAIN_WATCH_ONLY_PROFILE.supportedDepths,
    );

  it("scans an account xpub on Base, from Base's endpoint", async () => {
    const base = adapter("base");
    const [target] = resolve(account.publicExtendedKey, [base]);
    expect(target?.adapterId).toBe("base");
    const accounts = evmAccounts((_coin, address) => address === FIRST_ACCOUNT);
    const result = await base.scanWatchOnly!(
      { ...target!.material, id: "public-1", label: "Base" },
      { network: "mainnet", minimumCount: 1, includeUsedZeroBalance: false },
      context(accounts),
    );
    expect(accounts.mock.calls.every(([coin]) => coin === "base")).toBe(true);
    expect(result.sections[0]!.findings.map(({ title }) => title)).toEqual([FIRST_ACCOUNT]);
    expect(result.sections[0]!.source).toBe("https://base-rpc.publicnode.com");
  });

  it("lists every EVM network as a candidate of an ambiguous xpub, and none for a tpub", () => {
    const adapters = [ETHEREUM_RECOVERY_ADAPTER, ...EVM_NETWORK_RECOVERY_ADAPTERS];
    expect(resolve(account.publicExtendedKey, adapters).map(({ adapterId }) => adapterId)).toEqual(
      Object.keys(CHAIN_IDS),
    );
    const testnet = HDKey.fromMasterSeed(mnemonicToSeed(MNEMONIC), {
      private: 0x04358394,
      public: 0x043587cf,
    }).derive("m/44'/60'/0'");
    expect(() => resolve(testnet.publicExtendedKey, adapters)).toThrow(/No supported scan/u);
  });

  it("keeps the ethereum-xpub prefix Ethereum's: Base refuses it", () => {
    expect(() =>
      resolve(`ethereum-xpub:${account.publicExtendedKey}`, [adapter("base")]),
    ).toThrow();
    expect(() =>
      adapter("base").detectWatchOnly!(`ethereum-xpub:${account.publicExtendedKey}`, {
        auto: false,
      }),
    ).toThrow(/belongs to ethereum, not Base/u);
  });
});

describe("the development network worker's address.history admission", () => {
  const request = (coin: string) => ({
    id: "history-1",
    operation: "address.history",
    payload: { coin, network: "mainnet", address: FIRST_ACCOUNT },
  });

  it("admits Bitcoin and every EVM network whose row names a history endpoint", () => {
    for (const coin of ["bitcoin", "ethereum", "ethereum-classic"])
      expect(validateRecoveryNetworkRequest(request(coin))).toEqual(request(coin));
  });

  it("refuses an EVM network without a history endpoint", () => {
    expect(() => validateRecoveryNetworkRequest(request("base"))).toThrow(/not included/u);
  });
});

describe("the development network worker's evm.accounts admission", () => {
  const request = (payload: Record<string, unknown>) => ({
    id: "evm-1",
    operation: "evm.accounts",
    payload,
  });

  it("admits a network, an EVM network of the table and a bounded address batch", () => {
    const valid = request({ network: "mainnet", coin: "base", addresses: [FIRST_ACCOUNT] });
    expect(validateRecoveryNetworkRequest(valid)).toEqual(valid);
  });

  it.each([
    ["an unknown EVM network id", { network: "mainnet", coin: "hyperevm" }, /not included/u],
    ["the id under the old field", { network: "mainnet", chain: "base" }, /unsupported fields/u],
    ["no id at all", { network: "mainnet" }, /unsupported fields/u],
    ["an extra field", { network: "mainnet", coin: "base", url: "x" }, /unsupported fields/u],
  ])("refuses %s", (_name, payload, message) => {
    expect(() =>
      validateRecoveryNetworkRequest(request({ ...payload, addresses: [FIRST_ACCOUNT] })),
    ).toThrow(message);
  });
});
