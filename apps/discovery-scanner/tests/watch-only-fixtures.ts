import { vi } from "vitest";
import { BITCOIN_RECOVERY_ADAPTER } from "../src/coins/bitcoin/index.js";
import { ETHEREUM_RECOVERY_ADAPTER } from "../src/coins/ethereum/index.js";
import { DASH_RECOVERY_ADAPTER } from "../src/coins/dash/index.js";
import { resolveWatchOnlyTargets as resolveWatchOnlyTargetsForProfile } from "@ckd/recovery/watch-only.js";
import { MULTI_CHAIN_WATCH_ONLY_PROFILE } from "../src/multi-chain-watch-only.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import type { RecoveryNetworkApi } from "@ckd/network-boundary/protocol.js";
import type {
  RecoveryCoinAdapter,
  RecoveryScanContext,
  RecoveryWatchOnlyScanConfig,
} from "../src/types.js";

const resolveWatchOnlyTargets = (raw: string, adapters: readonly RecoveryCoinAdapter[]) =>
  resolveWatchOnlyTargetsForProfile(
    raw,
    adapters,
    MULTI_CHAIN_WATCH_ONLY_PROFILE.prefixCoins,
    MULTI_CHAIN_WATCH_ONLY_PROFILE.multiChain,
    MULTI_CHAIN_WATCH_ONLY_PROFILE.networklessAdapterIds,
    MULTI_CHAIN_WATCH_ONLY_PROFILE.supportedDepths,
  );

vi.mock("@ckd/dash-wasm/dash_shielded_wasm_bg.wasm", async () => {
  const { readFileSync } = await import("node:fs");
  return {
    default: readFileSync(
      new URL(
        "../../../packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm",
        import.meta.url,
      ),
    ),
  };
});

function context(overrides: Partial<RecoveryNetworkApi> = {}): RecoveryScanContext {
  const unavailable = async (): Promise<never> => {
    throw new Error("Unexpected network operation.");
  };
  return {
    signal: new AbortController().signal,
    sessionSecretGuard: new SecretEgressGuard(),
    onFinding: vi.fn(),
    onProgress: vi.fn(),
    networkApi: {
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
      accountStates: unavailable,
      ...overrides,
    },
  };
}
async function scan(
  adapter: RecoveryCoinAdapter,
  raw: string,
  ctx: RecoveryScanContext,
  scanConfig: RecoveryWatchOnlyScanConfig = WatchOnlyFixtures.config,
) {
  const target = resolveWatchOnlyTargets(raw, [adapter])[0]!;
  return adapter.scanWatchOnly!(
    { ...target.material, id: "public-1", label: adapter.label },
    scanConfig,
    ctx,
  );
}

/** Shared real adapters and an isolated provider boundary for public-input integration tests. */
export class WatchOnlyFixtures {
  static readonly publicKey = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
  static readonly config = {
    network: "mainnet" as const,
    minimumCount: 1,
    includeUsedZeroBalance: false,
  };
  static readonly adapters = [
    BITCOIN_RECOVERY_ADAPTER,
    ETHEREUM_RECOVERY_ADAPTER,
    DASH_RECOVERY_ADAPTER,
  ];
  static readonly resolve = resolveWatchOnlyTargets;
  static readonly context = context;
  static readonly scan = scan;
}
