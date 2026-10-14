import { WalletScan } from "../../wallet-result.js";
import type { DashSectionScan } from "./section-scan.js";
import { assertAddressCount } from "@ckd/core/bip32-limits.js";
import { DASH_COIN } from "./coin.js";
import { SeedScanSecrets } from "../../seed-scan-secrets.js";
import { isAbortError } from "@ckd/core/error-handling.js";
import { MAX_BIP32_INDEX, assertIndex } from "@ckd/core/bip32.js";
import type {
  RecoveryCoinAdapter,
  RecoveryProgress,
  RecoveryScanConfig,
  RecoverySection,
  RecoverySectionId,
  RecoverySeedInput,
  RecoveryWalletResult,
} from "../../types.js";
import { scanDashCore } from "./core-scanner.js";
import { scanDashCoinJoin } from "./coinjoin-scanner.js";
import { scanDashProviderCollateral } from "./funding-scanner.js";
import { scanDashIdentities } from "./identity-scanner.js";
import { scanDashLegacyCore } from "./legacy-core-scanner.js";
import { DashPlatformClient } from "./platform-client.js";
import { scanDashPlatformAddresses } from "./platform-scanner.js";
import { scanDashShielded, scanDashShieldedBatch } from "./shielded-scanner.js";
import { failedSection } from "./util.js";
import { summarizeDashSections } from "./summary.js";
import { dashSeedLookups } from "../../scan-estimate.js";

const TITLES: Record<RecoverySectionId, [string, string]> = {
  core: ["Dash Core · L1", "BIP44 receive and change address scan"],
  legacyCore: ["Dash Core · legacy mobile", "Historical DashSync legacy account scan"],
  coinjoin: ["Dash Mobile CoinJoin · DIP9", "Mobile/DashSync CoinJoin compatibility scan"],
  providerCollateral: [
    "Dash provider collateral/holdings",
    "Masternode provider collateral/holdings scan",
  ],
  platform: ["Dash Platform addresses", "DIP17 payment address scan"],
  identity: ["Dash Platform identities", "DIP13 identity discovery"],
  shielded: ["Dash Orchard · shielded pool", "Account-wide encrypted note recovery"],
};

function validateConfig(config: RecoveryScanConfig): void {
  assertIndex(config.account, "Account");
  assertAddressCount(config.coreReceiveCount, "Core receive count", 0);
  assertAddressCount(config.coreChangeCount, "Core change count", 0);
  if (config.scanCore && config.coreReceiveCount + config.coreChangeCount < 1) {
    throw new Error("At least one Dash Core receive or change address must be scanned.");
  }
  if (config.scanCustomPath === true) {
    assertAddressCount(config.customPathCount ?? 0, "Custom path address count");
    if (config.customPathFormat !== "p2pkh")
      throw new Error("Dash custom paths require the P2PKH address format.");
  }
  assertAddressCount(config.legacyCoreCount, "Legacy Core address count", 0);
  if (config.scanLegacyCore && config.legacyCoreCount < 1) {
    throw new Error("At least one legacy Core address per branch must be scanned.");
  }
  assertAddressCount(
    config.coinJoinExternalCount,
    "Dash Mobile CoinJoin · DIP9 external address count",
    0,
  );
  assertAddressCount(
    config.coinJoinInternalCount,
    "Dash Mobile CoinJoin · DIP9 internal address count",
    0,
  );
  if (config.scanCoinJoin && config.coinJoinExternalCount + config.coinJoinInternalCount < 1) {
    throw new Error(
      "At least one Dash Mobile CoinJoin · DIP9 external or internal address must be scanned.",
    );
  }
  assertAddressCount(config.identityFundingCount, "Registration funding keys to compare", 0);
  assertAddressCount(config.identityTopUpIdentityCount, "Identity-bound top-up identity count", 0);
  assertAddressCount(config.identityTopUpCount, "Identity-bound top-ups per identity", 0);
  if (config.scanIdentityFunding && config.identityFundingCount < 1) {
    throw new Error("At least one registration funding key must be compared.");
  }
  assertAddressCount(config.providerCollateralCount, "Provider collateral address count", 0);
  if (config.scanProviderCollateral && config.providerCollateralCount < 1) {
    throw new Error("At least one provider collateral/holdings address must be scanned.");
  }
  assertAddressCount(config.platformAddressCount, "Platform address count", 0);
  if (config.scanPlatformAddresses && config.platformAddressCount < 1) {
    throw new Error("At least one Dash Platform address must be scanned.");
  }
  assertIndex(config.identityStartIndex, "Identity start index");
  assertAddressCount(config.identityGapLimit, "Identity gap limit");
  assertAddressCount(config.identityScanLimit, "Identity scan limit");
  if (config.identityStartIndex + config.identityScanLimit - 1 > MAX_BIP32_INDEX) {
    throw new Error("The requested identity scan range exceeds the BIP32 index space.");
  }
  const componentFlags = [
    config.scanCore || config.scanCustomPath === true,
    config.scanLegacyCore,
    config.scanCoinJoin,
    config.scanIdentityFunding,
    config.scanProviderCollateral,
    config.scanPlatformAddresses,
    config.scanPlatformIdentities,
    config.scanShieldedPool,
  ];
  if (
    componentFlags.some((value) => typeof value !== "boolean") ||
    typeof config.includeUsedZeroBalance !== "boolean"
  ) {
    throw new Error("Recovery component and output options must be boolean values.");
  }
  if (!componentFlags.some(Boolean)) throw new Error("Select at least one Dash component to scan.");
  if (
    !config.scanCore &&
    (config.scanLegacyCore || config.scanCoinJoin || config.scanProviderCollateral)
  ) {
    throw new Error("Additional Dash Core path families require Dash Core · L1 scanning.");
  }
  if (config.scanIdentityFunding && !config.scanPlatformIdentities) {
    throw new Error("Identity registration funding details require Platform identity scanning.");
  }
}

async function guardedSection(
  id: RecoverySectionId,
  run: () => Promise<RecoverySection>,
): Promise<RecoverySection> {
  try {
    return await run();
  } catch (cause) {
    if (isAbortError(cause)) throw cause;
    const [title, description] = TITLES[id];
    return failedSection(id, title, description, cause);
  }
}

function skippedSection(id: RecoverySectionId): RecoverySection {
  const [title, description] = TITLES[id];
  return {
    id,
    title,
    description: `${description} was disabled in the scan settings.`,
    state: "skipped",
    metrics: [{ label: "Status", value: "Skipped" }],
    findings: [],
    scanned: id === "shielded" ? 0n : 0,
    source: "Not connected",
    proof: "Not requested",
  };
}

export const DASH_SEED_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  ...DASH_COIN,
  minimumSeedLookups: dashSeedLookups,

  async prepareBatch(inputs, config, context): Promise<ReadonlyMap<string, RecoverySection>> {
    validateConfig(config);
    return scanDashShieldedBatch(inputs, config, context);
  },

  async scan(input, config, context): Promise<RecoveryWalletResult> {
    validateConfig(config);
    const { secrets, seed, gateway } = SeedScanSecrets.forSeed(input, context);
    const platformClient = new DashPlatformClient(config.network, gateway);
    const walletScan = new WalletScan(input, DASH_COIN, config.network);
    const onProgress = (progress: RecoveryProgress): void => context.onProgress(progress);
    const onFinding =
      (section: RecoverySectionId) =>
      (finding: Parameters<typeof context.onFinding>[2]): void => {
        context.onFinding(input.id, section, finding);
      };
    try {
      context.onProgress({
        inputId: input.id,
        section: "prepare",
        message: "Mnemonic validated and seed derived locally",
        completed: 1,
        total: 1,
      });
      const startSection = async (
        id: RecoverySectionId,
        task: () => Promise<RecoverySection>,
      ): Promise<RecoverySection> => {
        context.onProgress({
          inputId: input.id,
          section: id,
          message: `Starting ${TITLES[id][0]} scan`,
          completed: 0,
          total: null,
        });
        const section = await guardedSection(id, task);
        const message =
          section.state === "failed"
            ? `Failed · ${section.warning ?? "authoritative result unavailable"}`
            : section.state === "partial"
              ? `Partial · ${section.warning ?? "configured range ended before discovery completed"}`
              : section.state === "skipped"
                ? "Skipped by scan settings"
                : // `scanned` is a number for address scans and a bigint for the
                  // Orchard pool; `=== 1` alone is always false for the bigint.
                  `Complete · ${section.scanned.toLocaleString()} item${section.scanned === 1 || section.scanned === 1n ? "" : "s"} checked`;
        context.onProgress({ inputId: input.id, section: id, message, completed: 1, total: 1 });
        return section;
      };
      /** Starts one section's scan when the settings ask for it, or reports it skipped. */
      const scanSection = <Source>(
        id: RecoverySectionId,
        enabled: boolean,
        scan: DashSectionScan<Source>,
        source: Source,
      ): Promise<RecoverySection> =>
        startSection(id, () =>
          enabled
            ? scan(input.id, seed, config, source, context.signal, onProgress, onFinding(id))
            : Promise.resolve(skippedSection(id)),
        );
      // These scanners have independent accounting state. Promise.all keeps the
      // returned section order stable while the shared semaphore remains the
      // sole authority for the maximum number of network/DAPI operations.
      const sections = await Promise.all([
        scanSection(
          "core",
          config.scanCore || config.scanCustomPath === true,
          scanDashCore,
          gateway,
        ),
        scanSection("legacyCore", config.scanLegacyCore, scanDashLegacyCore, gateway),
        scanSection("coinjoin", config.scanCoinJoin, scanDashCoinJoin, gateway),
        scanSection(
          "providerCollateral",
          config.scanProviderCollateral,
          scanDashProviderCollateral,
          gateway,
        ),
        scanSection(
          "platform",
          config.scanPlatformAddresses,
          scanDashPlatformAddresses,
          platformClient,
        ),
        scanSection("identity", config.scanPlatformIdentities, scanDashIdentities, platformClient),
        startSection("shielded", async () => {
          if (context.preparedSections !== undefined) {
            const prepared = (await context.preparedSections).get(input.id);
            if (prepared === undefined) throw new Error(`Shared Orchard scan omitted ${input.id}.`);
            return prepared;
          }
          return scanDashShielded(
            input.id,
            seed,
            config,
            gateway,
            context.signal,
            onProgress,
            onFinding("shielded"),
            context.sessionSecretGuard,
          );
        }),
      ]);
      return walletScan.result({
        overview: summarizeDashSections(sections),
        sections,
        warnings: [
          "For found funds, verify the public address, derivation path, branch/index and balance in the recovery report, then restore the mnemonic in a standard Dash wallet on a trusted device.",
        ],
      });
    } finally {
      secrets.close();
    }
  },
};

export type { RecoverySeedInput, RecoveryScanConfig };
