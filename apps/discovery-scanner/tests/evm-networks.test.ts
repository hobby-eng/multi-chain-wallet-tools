import { describe, expect, it, vi } from "vitest";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import type { RecoveryNetworkApi } from "@ckd/network-boundary/protocol.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import { resolveWatchOnlyTargets } from "@ckd/recovery/watch-only.js";
import { ETHEREUM_RECOVERY_ADAPTER } from "../src/coins/ethereum/index.js";
import { EVM_NETWORK_RECOVERY_ADAPTERS } from "../src/coins/evm-networks.js";
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
};
const ASSETS: Readonly<Record<string, string>> = {
  "bnb-chain": "BNB",
  polygon: "POL",
  arbitrum: "ETH",
  optimism: "ETH",
  base: "ETH",
  avalanche: "AVAX",
  gnosis: "xDAI",
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
