import { describe, expect, it } from "vitest";
import { BITCOIN_RECOVERY_ADAPTER } from "../src/coins/bitcoin/index.js";
import { ETHEREUM_RECOVERY_ADAPTER } from "../src/coins/ethereum/index.js";
import { createRecoveryExport } from "../src/export.js";
import { enrichRecoveryHistory } from "../src/history.js";
import type { RecoveryNetworkApi } from "@ckd/network-boundary/protocol.js";
import type {
  RecoveryCoinAdapter,
  RecoveryScanConfig,
  RecoveryScanContext,
  RecoveryWalletResult,
} from "../src/types.js";

// AUD-017-API002: the CSV balance_display column of non-Dash results, through the same steps
// as the Scanner: the adapter's own scan, the common history step, then the export.

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const BALANCE = 12_345_678n;

function unavailable(): Promise<never> {
  return Promise.reject(new Error("Unexpected network operation."));
}

function api(overrides: Partial<RecoveryNetworkApi>): RecoveryNetworkApi {
  return {
    ping: async () => "isolated-network-worker-v1",
    coreStatus: unavailable,
    coreTip: unavailable,
    coreAddressInfo: unavailable,
    coreAddressHistory: unavailable,
    coreTransaction: unavailable,
    platformAddresses: unavailable,
    platformAddressHistory: unavailable,
    platformIdentityByPublicKeyHash: unavailable,
    platformIdentityHistory: unavailable,
    shieldedPage: unavailable,
    addressHistory: unavailable,
    utxoAddresses: unavailable,
    evmAccounts: unavailable,
    ...overrides,
  };
}

const config = {
  network: "mainnet",
  account: 0,
  scanCore: true,
  coreReceiveCount: 1,
  coreChangeCount: 0,
  scanLegacyCore: false,
  legacyCoreCount: 0,
  scanCoinJoin: false,
  coinJoinExternalCount: 0,
  coinJoinInternalCount: 0,
  scanIdentityFunding: false,
  identityFundingCount: 0,
  identityTopUpIdentityCount: 0,
  identityTopUpCount: 0,
  scanProviderCollateral: false,
  providerCollateralCount: 0,
  scanPlatformAddresses: false,
  platformAddressCount: 0,
  scanPlatformIdentities: false,
  identityStartIndex: 0,
  identityGapLimit: 1,
  identityScanLimit: 1,
  includeUsedZeroBalance: false,
  scanShieldedPool: false,
} satisfies RecoveryScanConfig;

// Only the first address ever requested holds the synthetic balance, so the gap limit ends the
// scan. History is unavailable, as when a provider fails: the unit must not depend on it.
function publicData(): RecoveryNetworkApi {
  let requested = 0;
  const funded = () => requested++ === 0;
  return api({
    utxoAddresses: async (_network, addresses) =>
      addresses.map((address) => {
        const used = funded();
        return {
          address,
          balance: (used ? BALANCE : 0n).toString(),
          transactionCount: used ? 1 : 0,
        };
      }),
    evmAccounts: async (_network, addresses) => ({
      blockNumber: "1",
      entries: addresses.map((address) => {
        const used = funded();
        return { address, balance: (used ? BALANCE : 0n).toString(), nonce: used ? "1" : "0" };
      }),
    }),
  });
}

async function scanAndEnrich(adapter: RecoveryCoinAdapter): Promise<RecoveryWalletResult> {
  const context: RecoveryScanContext = {
    signal: new AbortController().signal,
    networkApi: publicData(),
    onProgress: () => {},
    onFinding: () => {},
  };
  const result = await adapter.scan(
    { id: "seed-1", label: "Seed phrase #1", mnemonic: MNEMONIC, passphrase: "" },
    config,
    context,
  );
  await enrichRecoveryHistory(adapter, result, context);
  return result;
}

function csvColumn(result: RecoveryWalletResult, name: string): string[] {
  const [header, ...rows] = createRecoveryExport([result], "csv").text.trim().split("\r\n");
  const cells = (line: string) =>
    [...line.matchAll(/"((?:[^"]|"")*)"/gu)].map((match) => match[1]!.replaceAll('""', '"'));
  const column = cells(header!).indexOf(name);
  return rows.map((row) => cells(row)[column]!).filter((value) => value !== "");
}

describe("Discovery CSV balance of non-Dash results", () => {
  it.each([
    [BITCOIN_RECOVERY_ADAPTER, "0.12345678", "BTC", "satoshis", "8"],
    [ETHEREUM_RECOVERY_ADAPTER, "0.000000000012345678", "ETH", "wei", "18"],
  ])("%s: exact display amount and unit", async (adapter, display, asset, atomicUnit, decimals) => {
    const result = await scanAndEnrich(adapter);
    const findings = result.sections.flatMap((section) => section.findings);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(({ balanceAtomic }) => balanceAtomic === BALANCE)).toBe(true);
    const shown = csvColumn(result, "balance_display");
    expect(shown).toHaveLength(findings.length);
    expect(new Set(shown)).toEqual(new Set([display]));
    expect(new Set(csvColumn(result, "balance_atomic"))).toEqual(new Set([BALANCE.toString()]));
    expect(new Set(csvColumn(result, "balance_asset"))).toEqual(new Set([asset]));
    expect(new Set(csvColumn(result, "balance_atomic_unit"))).toEqual(new Set([atomicUnit]));
    expect(new Set(csvColumn(result, "balance_decimals"))).toEqual(new Set([decimals]));
  });

  it("a future adapter needs only its declared unit, not a label the exporter knows", async () => {
    const adapter = {
      id: "future-coin",
      label: "Future coin",
      networks: ["mainnet"],
      amountUnit: () => ({ asset: "FUT", atomicUnit: "units", decimals: 3 }),
      scan: async () => futureResult(),
    } as unknown as RecoveryCoinAdapter;
    const result = await scanAndEnrich(adapter);
    expect(csvColumn(result, "balance_display")).toEqual(["12345.678"]);
    expect(csvColumn(result, "balance_asset")).toEqual(["FUT"]);
  });
});

function futureResult(): RecoveryWalletResult {
  return {
    inputId: "seed-1",
    label: "Seed phrase #1",
    coinId: "future-coin",
    coinLabel: "Future coin",
    network: "mainnet",
    startedAt: "2026-10-01T00:00:00.000Z",
    completedAt: "2026-10-01T00:01:00.000Z",
    overview: [],
    warnings: [],
    sections: [
      {
        id: "core",
        title: "Future coin accounts",
        description: "synthetic public result",
        state: "complete",
        metrics: [],
        findings: [
          {
            id: "future-coin:0",
            title: "synthetic public address",
            subtitle: "receive address",
            balanceAtomic: BALANCE,
            // A label in no format the exporter parses: the display must come from the unit.
            balanceLabel: "12345678 units",
            fields: [],
          },
        ],
        scanned: 1,
        source: "synthetic fixture",
        proof: "none",
      },
    ],
  } as unknown as RecoveryWalletResult;
}
