import { SCANNER_NETWORK_CONCURRENCY } from "./concurrency-parameters.js";
import {
  RECOVERY_CORE_ADDRESS_BATCH,
  RECOVERY_PLATFORM_ADDRESS_BATCH,
} from "@ckd/network-boundary/protocol.js";
import type { RecoveryCoinAdapter } from "./types.js";

const COINJOIN_COIN_TYPE: Record<"mainnet" | "testnet", number> = { mainnet: 5, testnet: 1 };

export function coinJoinPathPattern(network: string): string {
  const coinType =
    COINJOIN_COIN_TYPE[network as "mainnet" | "testnet"] ?? COINJOIN_COIN_TYPE.mainnet;
  return `external m/9'/${coinType}'/4'/0'/0/i · internal m/9'/${coinType}'/4'/0'/1/i`;
}

export function estimateInteger(value: string, minimum: number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error("Invalid estimate input.");
  return number;
}

function estimateConcurrency(value: string): number {
  return SCANNER_NETWORK_CONCURRENCY.parse(value, "Estimate concurrency");
}

interface StandardEstimateOptions {
  readonly customPath: boolean;
  readonly customRange: boolean;
  readonly requests: string;
  readonly includeUsedZero: boolean;
}

export function bitcoinScanEstimate(
  receiveCount: string,
  changeCount: string,
  options: StandardEstimateOptions,
): string {
  const perFamily = estimateInteger(receiveCount, 0) + estimateInteger(changeCount, 0);
  return `Bitcoin · 4 standard address families${options.customPath ? (options.customRange ? " + custom account range" : " + custom path") : ""} · ${(perFamily * 4).toLocaleString()} standard minimum addresses + 20-address post-use gaps · ${estimateConcurrency(options.requests)} network requests at once${options.includeUsedZero ? " · zero-balance history enabled" : ""}`;
}

export function ethereumScanEstimate(
  receiveCount: string,
  options: StandardEstimateOptions,
): string {
  return `Ethereum EOA · 3 standard wallet profiles${options.customPath ? (options.customRange ? " + custom account range" : " + custom path") : ""} · ${estimateInteger(receiveCount, 1).toLocaleString()} minimum derivations per profile + 20-address post-use gaps · ${estimateConcurrency(options.requests)} network requests at once${options.includeUsedZero ? " · used zero-balance accounts enabled" : ""}`;
}

interface DashScanEstimateInput {
  readonly scanCore: boolean;
  readonly receiveCount: string;
  readonly changeCount: string;
  readonly customPath: boolean;
  readonly scanLegacyCore: boolean;
  readonly legacyCoreCount: string;
  readonly scanCoinJoin: boolean;
  readonly coinJoinExternalCount: string;
  readonly coinJoinInternalCount: string;
  readonly scanIdentityFunding: boolean;
  readonly scanProviderCollateral: boolean;
  readonly providerCollateralCount: string;
  readonly scanPlatformAddresses: boolean;
  readonly platformCount: string;
  readonly scanPlatformIdentities: boolean;
  readonly identityLimit: string;
  readonly requestConcurrency: string;
  readonly includeUsedZero: boolean;
  readonly scanShielded: boolean;
}

/** Minimum Dash provider calls for one seed phrase, before post-use gaps extend any branch. */
function dashMinimumLookups(input: DashScanEstimateInput): {
  readonly addressBatches: number;
  readonly identityCalls: number;
} {
  const core = input.scanCore
    ? estimateInteger(input.receiveCount, 0) + estimateInteger(input.changeCount, 0)
    : 0;
  const legacyCore =
    input.scanCore && input.scanLegacyCore ? estimateInteger(input.legacyCoreCount, 0) * 2 : 0;
  const coinJoin =
    input.scanCore && input.scanCoinJoin
      ? estimateInteger(input.coinJoinExternalCount, 0) +
        estimateInteger(input.coinJoinInternalCount, 0)
      : 0;
  const providerCollateral =
    input.scanCore && input.scanProviderCollateral
      ? estimateInteger(input.providerCollateralCount, 0)
      : 0;
  const platform = input.scanPlatformAddresses ? estimateInteger(input.platformCount, 0) : 0;
  const coreBatches = Math.ceil(
    (core + legacyCore + coinJoin + providerCollateral) / RECOVERY_CORE_ADDRESS_BATCH,
  );
  const platformBatches = 2 * Math.ceil(platform / RECOVERY_PLATFORM_ADDRESS_BATCH);
  const identityCalls = input.scanPlatformIdentities ? estimateInteger(input.identityLimit, 1) : 0;
  return { addressBatches: coreBatches + platformBatches, identityCalls };
}

export function dashScanEstimate(input: DashScanEstimateInput): string {
  const { addressBatches: totalBatches, identityCalls: identities } = dashMinimumLookups(input);
  const requests = estimateConcurrency(input.requestConcurrency);
  const optionalFamilies = [
    input.scanCore && input.scanLegacyCore,
    input.scanCore && input.scanCoinJoin,
    input.scanPlatformIdentities && input.scanIdentityFunding,
    input.scanCore && input.scanProviderCollateral,
  ].filter(Boolean).length;
  return `${input.scanCore ? "Dash Core BIP44 selected" : "Dash Core skipped"}${input.customPath ? " · custom path selected" : ""} · ${optionalFamilies} optional coverage item${optionalFamilies === 1 ? "" : "s"} · ${totalBatches.toLocaleString()} minimum address batches${totalBatches > 0 ? " + gap 20" : ""} · about ${identities.toLocaleString()} identity proof calls per seed phrase · ${requests} network request${requests === 1 ? "" : "s"} at once${input.includeUsedZero ? " · zero-balance history enabled" : ""}${input.scanShielded ? " · complete Orchard pool" : ""}`;
}

/** Above this many minimum provider lookups a seed scan needs an explicit confirmation. */
export const LARGE_SCAN_LOOKUPS = 1_000;
/** Assumed time of one public-provider lookup; used only for the displayed estimate. */
const ESTIMATED_SECONDS_PER_LOOKUP = 1;

/** The scan settings that decide how many provider lookups one seed phrase needs. */
export interface SeedLookupSettings {
  readonly coreReceiveCount: string;
  readonly coreChangeCount: string;
  readonly scanCore: boolean;
  readonly scanLegacyCore: boolean;
  readonly legacyCoreCount: string;
  readonly scanCoinJoin: boolean;
  readonly coinJoinExternalCount: string;
  readonly coinJoinInternalCount: string;
  readonly scanIdentityFunding: boolean;
  readonly scanProviderCollateral: boolean;
  readonly providerCollateralCount: string;
  readonly scanPlatformAddresses: boolean;
  readonly platformAddressCount: string;
  readonly scanPlatformIdentities: boolean;
  readonly identityScanLimit: string;
  readonly requestConcurrency: string;
  readonly includeUsedZeroBalance: boolean;
  readonly scanShieldedPool: boolean;
}

/** The provider lookups of `count` addresses, `batchSize` to a lookup. */
export function lookupBatches(count: string, batchSize: number): number {
  return Math.ceil(estimateInteger(count, 0) / batchSize);
}

/** Minimum Dash provider lookups for one seed phrase with these settings, before post-use gaps. */
export function dashSeedLookups(settings: SeedLookupSettings): number {
  const dash = dashMinimumLookups({
    scanCore: settings.scanCore,
    receiveCount: settings.coreReceiveCount,
    changeCount: settings.coreChangeCount,
    customPath: false,
    scanLegacyCore: settings.scanLegacyCore,
    legacyCoreCount: settings.legacyCoreCount,
    scanCoinJoin: settings.scanCoinJoin,
    coinJoinExternalCount: settings.coinJoinExternalCount,
    coinJoinInternalCount: settings.coinJoinInternalCount,
    scanIdentityFunding: settings.scanIdentityFunding,
    scanProviderCollateral: settings.scanProviderCollateral,
    providerCollateralCount: settings.providerCollateralCount,
    scanPlatformAddresses: settings.scanPlatformAddresses,
    platformCount: settings.platformAddressCount,
    scanPlatformIdentities: settings.scanPlatformIdentities,
    identityLimit: settings.identityScanLimit,
    requestConcurrency: settings.requestConcurrency,
    includeUsedZero: settings.includeUsedZeroBalance,
    scanShielded: settings.scanShieldedPool,
  });
  return dash.addressBatches + dash.identityCalls;
}

/**
 * Minimum provider lookups for one seed phrase across the given coins, before post-use gaps. Each
 * coin counts its own (RecoveryCoinAdapter.minimumSeedLookups), so that an edition holds the code
 * of its own coins only.
 */
export function seedLookupsPerPhrase(
  coins: readonly Pick<RecoveryCoinAdapter, "id" | "minimumSeedLookups">[],
  settings: SeedLookupSettings,
): number {
  let lookups = 0;
  for (const coin of coins) {
    // A new coin adapter must state its lookups, or the estimate would silently drop it.
    if (coin.minimumSeedLookups === undefined)
      throw new Error(`No lookup estimate for coin ${coin.id}.`);
    lookups += coin.minimumSeedLookups(settings);
  }
  return lookups;
}

/**
 * Counts the lines that hold text, like the scan does when it pairs line N with phrase N. It walks
 * the characters instead of splitting, so no extra copies of the phrases are made.
 */
export function countCandidateLines(text: string): number {
  let count = 0;
  let lineHasText = false;
  for (const character of text) {
    if (character === "\n") {
      if (lineHasText) count += 1;
      lineHasText = false;
    } else if (character.trim() !== "") lineHasText = true;
  }
  return lineHasText ? count + 1 : count;
}

export interface LookupEstimate {
  readonly lookups: number;
  readonly seconds: number;
}

export function seedLookupEstimate(
  phrases: number,
  lookupsPerPhrase: number,
  requestConcurrency: string,
): LookupEstimate {
  const lookups = phrases * lookupsPerPhrase;
  const seconds = Math.ceil(
    (lookups * ESTIMATED_SECONDS_PER_LOOKUP) / estimateConcurrency(requestConcurrency),
  );
  return { lookups, seconds };
}

export function needsLargeScanConfirmation(estimate: LookupEstimate): boolean {
  return estimate.lookups > LARGE_SCAN_LOOKUPS;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `about ${hours} h` : `about ${hours} h ${rest} min`;
}

export function formatLookupEstimate(phrases: number, estimate: LookupEstimate): string {
  return `${phrases.toLocaleString()} phrase${phrases === 1 ? "" : "s"} · at least ${estimate.lookups.toLocaleString()} provider lookup${estimate.lookups === 1 ? "" : "s"} · ${formatDuration(estimate.seconds)}`;
}
