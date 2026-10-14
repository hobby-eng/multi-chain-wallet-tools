// AUD-026 functional: the addresses each Discovery Scanner seed scan asks a provider about, in
// order, recorded through synthetic providers (no network) from the production scan entry points:
// the Bitcoin and Ethereum seed adapters and the Dash Core, CoinJoin, legacy mobile and provider
// collateral section scans. functional-discovery-addresses-oracle.py derives the expected lists
// with its own BIP32 code. Output: docs/audits/AUD-026-evidence/functional/discovery-addresses.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { mnemonicToSeed } from "@ckd/core/bip39.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import { BITCOIN_SEED_RECOVERY_ADAPTER } from "../../../apps/discovery-scanner/src/coins/bitcoin/seed.js";
import { ETHEREUM_SEED_RECOVERY_ADAPTER } from "../../../apps/discovery-scanner/src/coins/ethereum/seed.js";
import { scanDashCore } from "../../../apps/discovery-scanner/src/coins/dash/core-scanner.js";
import { scanDashCoinJoin } from "../../../apps/discovery-scanner/src/coins/dash/coinjoin-scanner.js";
import { scanDashLegacyCore } from "../../../apps/discovery-scanner/src/coins/dash/legacy-core-scanner.js";
import { scanDashProviderCollateral } from "../../../apps/discovery-scanner/src/coins/dash/funding-scanner.js";
import { RecoveryNetworkGateway } from "../../../apps/discovery-scanner/src/network-gateway.js";
import type { RecoveryScanConfig } from "../../../apps/discovery-scanner/src/types.js";

const OUT = new URL("../AUD-026-evidence/functional/", import.meta.url);
const ABANDON = `${"abandon ".repeat(11)}about`;
const input = { id: "probe", label: "probe", kind: "seed", mnemonic: ABANDON, passphrase: "" };

function context(asked: string[]) {
  return {
    signal: new AbortController().signal,
    networkApi: {
      utxoAddresses: async (_n: string, addresses: string[]) => {
        asked.push(...addresses);
        return addresses.map((address) => ({ address, balance: "0", transactionCount: 0 }));
      },
      evmAccounts: async (_n: string, addresses: string[]) => {
        asked.push(...addresses);
        return {
          blockNumber: "1",
          entries: addresses.map((address) => ({ address, balance: "0", nonce: "0" })),
        };
      },
      coreStatus: async () => ({ status: "ok" }),
      coreTip: async () => ({ resultSet: [{ height: 1 }] }),
      coreAddressInfo: async (_n: string, addresses: string[]) => {
        asked.push(...addresses);
        return addresses.map((address) => ({ address, balance: "0", txCount: 0 }));
      },
    },
    onProgress: () => {},
    onFinding: () => {},
  } as never;
}

it("records the addresses each seed scan asks about", async () => {
  const dump: { scan: string; network: string; account: number; asked: string[] }[] = [];
  for (const network of ["mainnet", "testnet"] as const)
    for (const account of [0, 7]) {
      const config = {
        network,
        account,
        scanCore: true,
        coreReceiveCount: 2,
        coreChangeCount: 1,
        includeUsedZeroBalance: false,
        legacyCoreCount: 2,
        coinJoinExternalCount: 2,
        coinJoinInternalCount: 1,
        providerCollateralCount: 2,
      } as RecoveryScanConfig;
      for (const [scan, adapter] of [
        ["bitcoin", BITCOIN_SEED_RECOVERY_ADAPTER],
        ["ethereum", ETHEREUM_SEED_RECOVERY_ADAPTER],
      ] as const) {
        const asked: string[] = [];
        await adapter.scan(input as never, config, context(asked));
        dump.push({ scan, network, account, asked });
      }
      const seed = mnemonicToSeed(ABANDON);
      for (const [scan, section] of [
        ["dash-core", scanDashCore],
        ["dash-coinjoin", scanDashCoinJoin],
        ["dash-legacy", scanDashLegacyCore],
        ["dash-provider", scanDashProviderCollateral],
      ] as const) {
        const asked: string[] = [];
        const ctx = context(asked) as unknown as { networkApi: never };
        const gateway = new RecoveryNetworkGateway(new SecretEgressGuard(), ctx.networkApi);
        await section(
          "probe",
          seed,
          config,
          gateway,
          new AbortController().signal,
          () => {},
          () => {},
        );
        dump.push({ scan, network, account, asked });
      }
    }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL("discovery-addresses.json", OUT), JSON.stringify(dump, null, 1));
});
