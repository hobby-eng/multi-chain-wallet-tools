// The Dash recovery adapter with the direct network service, built for Node, as the live recovery
// smoke checks run it.
import { resolve } from "node:path";
import { root, withNodeModule } from "../../../tooling/node-module.mjs";

/** Passes the adapter, the network service and the task limiter of a scan to `use`. */
export function withDashRecovery(use) {
  const module = (path) => JSON.stringify(resolve(root, path));
  return withNodeModule(
    {
      contents: `
        import { DASH_RECOVERY_ADAPTER } from ${module("apps/discovery-scanner/src/coins/dash/index.ts")};
        import { RecoveryConcurrencyLimiter, mapRecoveryTasks } from ${module("apps/discovery-scanner/src/concurrency.ts")};
        import { DirectRecoveryNetworkService } from ${module("apps/discovery-scanner/src/network-service.ts")};
        export { DASH_RECOVERY_ADAPTER, RecoveryConcurrencyLimiter, mapRecoveryTasks, DirectRecoveryNetworkService };
      `,
    },
    use,
    { target: "node24", loader: { ".wasm": "binary" }, define: { __DASH_COMMUNITY__: "false" } },
  );
}

/**
 * The settings of a live smoke scan: Core and Platform with the families of extra paths off,
 * `counts` setting how far each goes.
 */
export function smokeScanConfig(network, counts) {
  return {
    network,
    account: 0,
    scanCore: true,
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
    scanPlatformAddresses: true,
    scanPlatformIdentities: true,
    identityStartIndex: 0,
    includeUsedZeroBalance: false,
    scanShieldedPool: false,
    ...counts,
  };
}
